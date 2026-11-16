//! Renderer-Spike CHAOS-75: dieselbe Testszene wie das Spielbrett (Babylon), gerendert mit Bevy.
//!
//! - Kulisse: `assets/export/brett.glb`, exportiert aus dem echten Brett
//!   (`node scripts/spike-export-board.mjs`), Thin Instances (Gras, Blumen) aus
//!   `assets/export/brett.instanzen.json` als eigene Entitäten (Bevy bündelt sie automatisch).
//! - Figuren: Original-GLBs aus `packages/assets` mit Idle-Animation, Orte aus `brett.szene.json`.
//! - Licht: Sonne mit Kaskadenschatten wie die Brett-Sonne, Umgebungslicht statt HDRI.
//!
//! Messung: nach `aufwaermen` Sekunden Bildabstände über `sekunden` Sekunden, Ergebnis als
//! JSON-Zeile (Konsole, im Browser zusätzlich auf der Seite). Parameter nativ als
//! `--name=wert`, im Browser als Query (`?sekunden=30&vsync=1`):
//! `sekunden` (20), `aufwaermen` (3), `vsync` (0), `breite`/`hoehe` (1920×1080, nur nativ),
//! `schatten` (1), `schattenkarte` (4096), `gras` (Anteil 0–1, Standard 1), `msaa` (4), `bild` (Pfad für ein Bildschirmfoto, nur nativ),
//! `fenster` (1; `0` rendert nativ ohne Fenster in ein Bild – Rauchtest, keine Messung).

use bevy::{
    animation::{AnimationPlayer, graph::AnimationGraph, graph::AnimationGraphHandle},
    camera::Exposure,
    gltf::{Gltf, GltfAssetLabel},
    light::{CascadeShadowConfigBuilder, DirectionalLightShadowMap},
    prelude::*,
    render::view::{
        Msaa,
        screenshot::{Screenshot, save_to_disk},
    },
    window::{PresentMode, WindowResolution},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Parameter
// ---------------------------------------------------------------------------

#[derive(Resource, Clone, Debug, Serialize)]
struct Settings {
    seconds: f32,
    warmup: f32,
    vsync: bool,
    width: u32,
    height: u32,
    shadows: bool,
    /// Anteil der Gras- und Blumen-Instanzen (wie `QUALITY[…].grass`: hoch 1, niedrig 0,25).
    grass: f32,
    /// Kantenlänge der Schattenkarte (hoch 4096, mittel 2048, niedrig 1024).
    shadow_map: usize,
    msaa: u32,
    screenshot: Option<String>,
    /// Nativ ohne Fenster in ein Bild rendern (`fenster=0`): Rauchtest ohne Bildschirm.
    offscreen: bool,
}

fn read_settings() -> Settings {
    let params = raw_params();
    let num = |key: &str, default: f32| {
        params
            .get(key)
            .and_then(|v| v.parse::<f32>().ok())
            .unwrap_or(default)
    };
    let flag = |key: &str, default: bool| {
        params
            .get(key)
            .map(|v| v == "1" || v == "true" || v == "ja")
            .unwrap_or(default)
    };
    Settings {
        seconds: num("sekunden", 20.0).max(1.0),
        warmup: num("aufwaermen", 3.0).max(0.0),
        vsync: flag("vsync", false),
        width: num("breite", 1920.0) as u32,
        height: num("hoehe", 1080.0) as u32,
        shadows: flag("schatten", true),
        grass: num("gras", 1.0).clamp(0.0, 1.0),
        shadow_map: num("schattenkarte", 4096.0) as usize,
        msaa: num("msaa", 4.0) as u32,
        screenshot: params.get("bild").cloned(),
        offscreen: cfg!(not(target_arch = "wasm32")) && !flag("fenster", true),
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn raw_params() -> HashMap<String, String> {
    std::env::args()
        .skip(1)
        .filter_map(|arg| {
            let arg = arg.trim_start_matches("--");
            arg.split_once('=')
                .map(|(k, v)| (k.to_string(), v.to_string()))
        })
        .collect()
}

#[cfg(target_arch = "wasm32")]
fn raw_params() -> HashMap<String, String> {
    let search = web_sys::window()
        .and_then(|w| w.location().search().ok())
        .unwrap_or_default();
    search
        .trim_start_matches('?')
        .split('&')
        .filter_map(|pair| {
            pair.split_once('=')
                .map(|(k, v)| (k.to_string(), v.to_string()))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Beschreibung der Testszene (aus dem Babylon-Export)
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug, Clone)]
struct SceneMeta {
    camera: CameraMeta,
    sun: Option<LightMeta>,
    sky: Option<SkyMeta>,
    #[serde(rename = "clearColor")]
    clear_color: [f32; 4],
    pawns: Vec<PawnMeta>,
}

#[derive(Deserialize, Debug, Clone)]
struct CameraMeta {
    position: [f32; 3],
    target: [f32; 3],
    #[serde(rename = "fovY")]
    fov_y: f32,
    near: f32,
    far: f32,
}

#[derive(Deserialize, Debug, Clone)]
struct LightMeta {
    direction: [f32; 3],
    intensity: f32,
    color: [f32; 3],
}

#[derive(Deserialize, Debug, Clone)]
struct SkyMeta {
    intensity: f32,
    color: [f32; 3],
}

#[derive(Deserialize, Debug, Clone)]
struct PawnMeta {
    character: String,
    position: [f32; 3],
}

#[derive(Deserialize, Debug, Clone)]
struct InstancedMesh {
    mesh: String,
    matrices: Vec<[f32; 16]>,
}

/// Beide Beschreibungen werden zur Laufzeit geladen (nativ Datei, im Browser per HTTP über den
/// Asset-Server), deshalb als eigene Asset-Typen mit JSON-Lader.
#[derive(Asset, TypePath, Deserialize, Debug, Clone)]
struct MetaAsset(SceneMeta);

#[derive(Asset, TypePath, Deserialize, Debug, Clone)]
struct InstancesAsset(Vec<InstancedMesh>);

/// Dateiendung je Beschreibung (mehrteilig, damit zwei JSON-Lader nebeneinander passen).
trait JsonAsset: Asset + for<'de> Deserialize<'de> {
    const EXTENSIONS: &'static [&'static str];
}

impl JsonAsset for MetaAsset {
    const EXTENSIONS: &'static [&'static str] = &["szene.json"];
}

impl JsonAsset for InstancesAsset {
    const EXTENSIONS: &'static [&'static str] = &["instanzen.json"];
}

#[derive(TypePath)]
struct JsonLoader<T>(std::marker::PhantomData<fn() -> T>);

impl<T> Default for JsonLoader<T> {
    fn default() -> Self {
        Self(std::marker::PhantomData)
    }
}

impl<T: JsonAsset> bevy::asset::AssetLoader for JsonLoader<T> {
    type Asset = T;
    type Settings = ();
    type Error = std::io::Error;

    async fn load(
        &self,
        reader: &mut dyn bevy::asset::io::Reader,
        _settings: &(),
        _context: &mut bevy::asset::LoadContext<'_>,
    ) -> Result<T, Self::Error> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;
        serde_json::from_slice(&bytes).map_err(std::io::Error::other)
    }

    fn extensions(&self) -> &[&str] {
        T::EXTENSIONS
    }
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

#[derive(Resource)]
struct Loading {
    meta: Handle<MetaAsset>,
    instances: Handle<InstancesAsset>,
    figures: HashMap<String, Handle<Gltf>>,
    spawned: bool,
    instances_done: bool,
}

#[derive(Component)]
struct BoardRoot;

#[derive(Component)]
struct Pawn {
    character: String,
}

#[derive(Component)]
struct Hud;

#[derive(Resource, Default)]
struct Meter {
    started: Option<f64>,
    samples: Vec<f32>,
    done: bool,
    scene_ready_at: Option<f64>,
}

fn main() {
    let settings = read_settings();
    let mut app = App::new();
    let window_plugin = if settings.offscreen {
        WindowPlugin {
            primary_window: None,
            exit_condition: bevy::window::ExitCondition::DontExit,
            ..default()
        }
    } else {
        WindowPlugin {
            primary_window: Some(Window {
                title: "Chaos Party – Renderer-Spike (Bevy)".into(),
                resolution: WindowResolution::new(settings.width, settings.height),
                present_mode: if settings.vsync {
                    PresentMode::AutoVsync
                } else {
                    PresentMode::AutoNoVsync
                },
                canvas: Some("#spike".into()),
                fit_canvas_to_parent: true,
                ..default()
            }),
            ..default()
        }
    };
    let plugins = DefaultPlugins.set(window_plugin).set(AssetPlugin {
        // Im Browser liegen die Assets neben der Seite unter `assets/`.
        meta_check: bevy::asset::AssetMetaCheck::Never,
        ..default()
    });
    if settings.offscreen {
        app.add_plugins((
            plugins.disable::<bevy::winit::WinitPlugin>(),
            bevy::app::ScheduleRunnerPlugin::run_loop(std::time::Duration::ZERO),
        ));
    } else {
        app.add_plugins(plugins);
    }
    app.init_asset::<MetaAsset>()
        .init_asset::<InstancesAsset>()
        .register_asset_loader(JsonLoader::<MetaAsset>::default())
        .register_asset_loader(JsonLoader::<InstancesAsset>::default())
        .insert_resource(DirectionalLightShadowMap {
            size: settings.shadow_map,
        })
        .insert_resource(settings)
        .init_resource::<Meter>()
        .add_systems(Startup, start_loading)
        .add_systems(
            Update,
            (
                spawn_scene,
                spawn_instances,
                start_idle,
                measure,
                take_screenshot,
            ),
        );
    app.run();
}

/// Ziel des Offscreen-Modus.
#[derive(Resource)]
struct OffscreenTarget(Handle<Image>);

fn start_loading(
    mut commands: Commands,
    assets: Res<AssetServer>,
    settings: Res<Settings>,
    mut images: ResMut<Assets<Image>>,
) {
    if settings.offscreen {
        let image = Image::new_target_texture(
            settings.width,
            settings.height,
            bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb,
            None,
        );
        commands.insert_resource(OffscreenTarget(images.add(image)));
    }
    let mut figures = HashMap::new();
    for character in ["robot", "cactus", "raccoon", "sock"] {
        figures.insert(
            character.to_string(),
            assets.load(format!("export/figuren/{character}.glb")),
        );
    }
    commands.insert_resource(Loading {
        meta: assets.load("export/brett.szene.json"),
        instances: assets.load("export/brett.instanzen.json"),
        figures,
        spawned: false,
        instances_done: false,
    });
    commands.spawn((
        Hud,
        Text::new("lädt …"),
        TextFont {
            font_size: bevy::text::FontSize::Px(18.0),
            ..default()
        },
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(12.0),
            top: Val::Px(10.0),
            ..default()
        },
    ));
}

fn vec3(v: [f32; 3]) -> Vec3 {
    Vec3::new(v[0], v[1], v[2])
}

fn color(c: [f32; 3]) -> Color {
    Color::linear_rgb(c[0], c[1], c[2])
}

fn spawn_scene(
    mut commands: Commands,
    offscreen: Option<Res<OffscreenTarget>>,
    mut loading: ResMut<Loading>,
    metas: Res<Assets<MetaAsset>>,
    assets: Res<AssetServer>,
    settings: Res<Settings>,
) {
    if loading.spawned {
        return;
    }
    let Some(MetaAsset(meta)) = metas.get(&loading.meta) else {
        return;
    };
    loading.spawned = true;

    // Kamera wie die Brett-Kamera (FreeCamera, vertikales Sichtfeld).
    let cam = &meta.camera;
    let mut camera = commands.spawn((
        Camera3d::default(),
        Camera {
            clear_color: ClearColorConfig::Custom(Color::linear_rgba(
                meta.clear_color[0],
                meta.clear_color[1],
                meta.clear_color[2],
                1.0,
            )),
            ..default()
        },
        Projection::Perspective(PerspectiveProjection {
            fov: cam.fov_y,
            near: cam.near,
            far: cam.far,
            ..default()
        }),
        Exposure::INDOOR,
        match settings.msaa {
            0 | 1 => Msaa::Off,
            2 => Msaa::Sample2,
            8 => Msaa::Sample8,
            _ => Msaa::Sample4,
        },
        Transform::from_translation(vec3(cam.position)).looking_at(vec3(cam.target), Vec3::Y),
        AmbientLight {
            color: meta
                .sky
                .as_ref()
                .map(|s| color(s.color))
                .unwrap_or(Color::WHITE),
            // Babylon-Hemisphäre (≈ 0,3–0,6) grob auf Bevys Helligkeit abgebildet.
            brightness: meta.sky.as_ref().map(|s| s.intensity).unwrap_or(0.5) * 900.0,
            ..default()
        },
    ));
    if let Some(target) = offscreen {
        camera.insert(bevy::camera::RenderTarget::Image(target.0.clone().into()));
    }

    if let Some(sun) = &meta.sun {
        let dir = vec3(sun.direction).normalize_or(Vec3::NEG_Y);
        commands.spawn((
            DirectionalLight {
                color: color(sun.color),
                // Babylon-Intensität (≈ 1–3) auf Lux für die Belichtung INDOOR.
                illuminance: sun.intensity * 1500.0,
                shadow_maps_enabled: settings.shadows,
                ..default()
            },
            Transform::from_translation(-dir * 40.0).looking_to(dir, Vec3::Y),
            CascadeShadowConfigBuilder {
                num_cascades: 2,
                maximum_distance: 80.0,
                first_cascade_far_bound: 25.0,
                ..default()
            }
            .build(),
        ));
    }

    commands.spawn((
        BoardRoot,
        WorldAssetRoot(assets.load(GltfAssetLabel::Scene(0).from_asset("export/brett.glb"))),
    ));

    // Figuren schauen zur Kamera (wie meist am Brett).
    for pawn in &meta.pawns {
        let at = vec3(pawn.position);
        let to_cam = (vec3(cam.position) - at) * Vec3::new(1.0, 0.0, 1.0);
        let yaw = to_cam.x.atan2(to_cam.z);
        commands.spawn((
            Pawn {
                character: pawn.character.clone(),
            },
            WorldAssetRoot(
                assets.load(
                    GltfAssetLabel::Scene(0)
                        .from_asset(format!("export/figuren/{}.glb", pawn.character)),
                ),
            ),
            Transform::from_translation(at).with_rotation(Quat::from_rotation_y(yaw)),
        ));
    }
}

/// Thin Instances aus Babylon: das Grundmesh im GLB verstecken und je Matrix eine Entität mit
/// denselben Mesh- und Material-Handles setzen (Bevy fasst sie zu Instanzen-Draws zusammen).
fn spawn_instances(
    mut commands: Commands,
    mut loading: ResMut<Loading>,
    instances: Res<Assets<InstancesAsset>>,
    settings: Res<Settings>,
    meshes: Query<(
        Entity,
        &Name,
        Option<&ChildOf>,
        &Mesh3d,
        &MeshMaterial3d<StandardMaterial>,
    )>,
    names: Query<&Name>,
) {
    if loading.instances_done || !loading.spawned {
        return;
    }
    let Some(InstancesAsset(list)) = instances.get(&loading.instances) else {
        return;
    };
    if meshes.is_empty() {
        return;
    }
    let mut found = 0usize;
    for entry in list {
        // Primitive heißen wie ihr Mesh oder hängen unter einem Knoten dieses Namens.
        let matches: Vec<_> = meshes
            .iter()
            .filter(|(_, name, parent, _, _)| {
                name.as_str() == entry.mesh
                    || name.as_str().starts_with(&format!("{}.", entry.mesh))
                    || parent
                        .and_then(|p| names.get(p.parent()).ok())
                        .is_some_and(|n| n.as_str() == entry.mesh)
            })
            .collect();
        for (entity, _, _, mesh, material) in &matches {
            found += 1;
            commands.entity(*entity).insert(Visibility::Hidden);
            // Gleichmäßig ausdünnen wie Babylons Grasanteil je Stufe.
            let keep = (entry.matrices.len() as f32 * settings.grass).round() as usize;
            let step = if keep == 0 {
                0.0
            } else {
                entry.matrices.len() as f32 / keep as f32
            };
            for m in (0..keep).filter_map(|i| entry.matrices.get((i as f32 * step) as usize)) {
                let transform = Transform::from_matrix(Mat4::from_cols_array(m));
                commands.spawn(((*mesh).clone(), (*material).clone(), transform));
            }
        }
    }
    if found > 0 {
        loading.instances_done = true;
        let total: usize = list.iter().map(|e| e.matrices.len()).sum();
        info!(
            "Instanzen: {} Gruppen, {} Primitive gefunden, {} Instanzen",
            list.len(),
            found,
            total
        );
    }
}

/// Idle-Animation der Figuren starten, sobald ihr Skelett (AnimationPlayer) existiert.
fn start_idle(
    mut commands: Commands,
    loading: Res<Loading>,
    gltfs: Res<Assets<Gltf>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mut players: Query<(Entity, &mut AnimationPlayer), Without<AnimationGraphHandle>>,
    parents: Query<&ChildOf>,
    pawns: Query<&Pawn>,
) {
    for (entity, mut player) in &mut players {
        let Some(pawn) = parents
            .iter_ancestors(entity)
            .find_map(|a| pawns.get(a).ok())
        else {
            continue;
        };
        let Some(gltf) = loading
            .figures
            .get(&pawn.character)
            .and_then(|h| gltfs.get(h))
        else {
            continue;
        };
        let clip = gltf
            .named_animations
            .iter()
            .find(|(name, _)| name.to_lowercase().contains("idle"))
            .map(|(_, clip)| clip.clone())
            .or_else(|| gltf.animations.first().cloned());
        let Some(clip) = clip else { continue };
        let (graph, node) = AnimationGraph::from_clip(clip);
        player.play(node).repeat();
        commands
            .entity(entity)
            .insert(AnimationGraphHandle(graphs.add(graph)));
    }
}

fn percentile(sorted: &[f32], p: f32) -> f32 {
    if sorted.is_empty() {
        return f32::NAN;
    }
    let idx = ((sorted.len() as f32 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

#[derive(Serialize)]
struct Report<'a> {
    spike: &'static str,
    renderer: &'static str,
    plattform: &'static str,
    adapter: String,
    aufloesung: [u32; 2],
    bilder: usize,
    fps_mittel: f32,
    bildabstand_ms_median: f32,
    bildabstand_ms_p95: f32,
    bildabstand_ms_max: f32,
    einstellungen: &'a Settings,
}

fn measure(
    time: Res<Time<Real>>,
    mut meter: ResMut<Meter>,
    loading: Res<Loading>,
    settings: Res<Settings>,
    windows: Query<&Window>,
    adapter: Option<Res<bevy::render::renderer::RenderAdapterInfo>>,
    mut hud: Query<&mut Text, With<Hud>>,
    meshes: Query<(), With<Mesh3d>>,
) {
    let now = time.elapsed_secs_f64();
    if !loading.instances_done {
        return;
    }
    let ready_at = *meter.scene_ready_at.get_or_insert(now);
    if now - ready_at < settings.warmup as f64 {
        if let Ok(mut text) = hud.single_mut() {
            text.0 = format!("aufwärmen … ({} Meshes)", meshes.iter().count());
        }
        return;
    }
    if meter.done {
        return;
    }
    let started = *meter.started.get_or_insert(now);
    let dt = time.delta_secs() * 1000.0;
    if dt > 0.0 {
        meter.samples.push(dt);
    }
    let elapsed = (now - started) as f32;
    let mut sorted = meter.samples.clone();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let median = percentile(&sorted, 0.5);
    let adapter_name = adapter
        .as_ref()
        .map(|a| format!("{} ({:?})", a.name, a.backend))
        .unwrap_or_else(|| "unbekannt".into());
    if let Ok(mut text) = hud.single_mut() {
        text.0 = format!(
            "Bevy {}  {}  Bildabstand Median {:.2} ms ({:.0} fps)  {:.0}/{:.0} s",
            renderer_label(),
            adapter_name,
            median,
            1000.0 / median,
            elapsed,
            settings.seconds
        );
    }
    if elapsed < settings.seconds {
        return;
    }
    meter.done = true;
    let size = windows
        .single()
        .map(|w| [w.physical_width(), w.physical_height()])
        .unwrap_or([settings.width, settings.height]);
    let total: f32 = sorted.iter().sum();
    let report = Report {
        spike: "CHAOS-75",
        renderer: renderer_label(),
        plattform: if cfg!(target_arch = "wasm32") {
            "web"
        } else {
            std::env::consts::OS
        },
        adapter: adapter_name,
        aufloesung: size,
        bilder: sorted.len(),
        fps_mittel: sorted.len() as f32 * 1000.0 / total,
        bildabstand_ms_median: median,
        bildabstand_ms_p95: percentile(&sorted, 0.95),
        bildabstand_ms_max: sorted.last().copied().unwrap_or(f32::NAN),
        einstellungen: &settings,
    };
    let line = serde_json::to_string(&report).unwrap_or_default();
    publish(&line);
    if let Ok(mut text) = hud.single_mut() {
        text.0 = format!("Ergebnis: {line}");
    }
}

fn renderer_label() -> &'static str {
    if cfg!(all(target_arch = "wasm32", feature = "webgpu")) {
        "wasm-webgpu"
    } else if cfg!(target_arch = "wasm32") {
        "wasm-webgl2"
    } else {
        "nativ"
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn publish(line: &str) {
    println!("SPIKE-ERGEBNIS {line}");
}

#[cfg(target_arch = "wasm32")]
fn publish(line: &str) {
    web_sys::console::log_1(&format!("SPIKE-ERGEBNIS {line}").into());
    if let Some(el) = web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.get_element_by_id("ergebnis"))
    {
        el.set_text_content(Some(line));
    }
}

/// Nativ: optional ein Bildschirmfoto kurz nach dem Aufwärmen, danach beenden, sobald gemessen.
fn take_screenshot(
    mut commands: Commands,
    meter: Res<Meter>,
    settings: Res<Settings>,
    time: Res<Time<Real>>,
    mut taken: Local<bool>,
    mut exit: MessageWriter<AppExit>,
    mut done_at: Local<Option<f64>>,
    offscreen: Option<Res<OffscreenTarget>>,
) {
    let Some(ready) = meter.scene_ready_at else {
        return;
    };
    let now = time.elapsed_secs_f64();
    if let Some(path) = &settings.screenshot {
        if !*taken && now - ready > settings.warmup as f64 {
            *taken = true;
            let shot = match &offscreen {
                Some(target) => Screenshot::image(target.0.clone()),
                None => Screenshot::primary_window(),
            };
            commands.spawn(shot).observe(save_to_disk(path.clone()));
        }
    }
    if cfg!(not(target_arch = "wasm32")) && meter.done {
        let at = *done_at.get_or_insert(now);
        if now - at > 1.0 {
            exit.write(AppExit::Success);
        }
    }
}
