/**
 * Sockenregen – Arcade-Minispiel (CHAOS-29/30, EXP-005). Babylon-Ansicht über der reinen
 * Logik aus `logic.ts`: Arena, Waschmaschine Wumms, Socken/Bügeleisen mit Landeschatten,
 * Figuren mit Slot-Ring und Slot-Symbol. Alles wird in `prepare` in `ctx.scene` angelegt
 * und in `dispose` wieder entfernt; Zeit nur über `update`, Zufall nur über `ctx.rng`.
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import {
  rankByScore,
  type MinigameInput,
  type MinigameResult,
  type Slot,
} from '@chaos-party/minigame-sdk';
import type {
  CharacterAnimation,
  CharacterHandle,
  Minigame,
  MinigameContext,
  MinigameHud,
  MinigameModule,
  MinigamePlayer,
} from '@chaos-party/minigame-sdk/babylon';
import { markVisual } from '@chaos-party/minigame-sdk/babylon';
import { sockenregenHighlights } from './highlights.ts';
import { SOCKENREGEN_INFO } from './info.ts';
import {
  LAUNCH_POINT,
  SOCKENREGEN_RULES,
  SockenregenLogic,
  flightPosition,
  type Item,
  type ItemKind,
  type SockEvent,
} from './logic.ts';

/** Kräftige Spielzeugfarben für normale Socken (je Socke fest). */
const SOCK_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ff922b'] as const;
const PALETTE = {
  floor: '#ffc994',
  mat: '#38b6e8',
  matStripe: '#9be3ff',
  rim: '#ffcc33',
  machine: '#fbfbff',
  machinePanel: '#5fe0b4',
  chrome: '#c4ccd8',
  glass: '#9fdcff',
  dark: '#2b2d42',
  white: '#ffffff',
  gold: '#ffc61a',
  iron: '#b9c6d6',
  ironHandle: '#ef3b4f',
  danger: '#ff3355',
  bubble: '#f2fbff',
  wall: '#ffe2bd',
  star: '#ffe14d',
} as const;

interface RunnerView {
  readonly slot: Slot;
  readonly player: MinigamePlayer;
  readonly character: CharacterHandle;
  readonly ring: Mesh;
  readonly badge: TransformNode;
  readonly stars: TransformNode;
  anim: CharacterAnimation | null;
  /** Plattgedrückt (0 = normal, 1 = flach). */
  squash: number;
}

interface ItemMeshes {
  readonly kind: ItemKind;
  /** Grundgröße (Socken etwas größer als echt, damit man sie im Fernseher sieht). */
  readonly scale: number;
  readonly root: TransformNode;
  readonly shadow: Mesh;
  readonly ring: Mesh;
}

interface ItemView {
  readonly item: Item;
  readonly meshes: ItemMeshes;
  /** Sichtbar bis (Anzeigezeit), nachdem ein Bügeleisen gelandet ist. */
  lingerUntil: number;
}

class Sockenregen implements Minigame {
  private ctx: MinigameContext | null = null;
  private logic: SockenregenLogic | null = null;
  private running = false;
  private result: MinigameResult | null = null;
  private visualTime = 0;
  private machineKick = 0;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly materials = new Map<string, Material>();
  private readonly runners = new Map<Slot, RunnerView>();
  private readonly itemViews = new Map<number, ItemView>();
  private readonly pool: ItemMeshes[] = [];
  private readonly bubbles: Mesh[] = [];
  private drum: TransformNode | null = null;
  private machine: TransformNode | null = null;
  private pupils: Mesh[] = [];
  private lookX = 0;
  private sockCount = 0;
  /** Sieger hüpfen nach dem Ende. */
  private readonly winners = new Set<Slot>();

  async prepare(ctx: MinigameContext): Promise<void> {
    this.ctx = ctx;
    this.logic = new SockenregenLogic(
      ctx.players.map((player) => player.slot),
      ctx.rng,
      ctx.timeLimitMs,
    );
    const { scene } = ctx;
    const camera = new ArcRotateCamera(
      'socken-kamera',
      -Math.PI / 2,
      0.92,
      24.5,
      new Vector3(0, 1.1, 2.3),
      scene,
    );
    camera.fov = 0.72;
    scene.activeCamera = camera;
    this.disposables.push(camera);
    if (ctx.look) {
      // Natur-Look (CHAOS-62): Wiese, Licht und Himmel kommen vom Host; frei bleiben Matte,
      // Wäschekörbe und Wumms dahinter.
      ctx.look.backdrop({ halfX: 10.6, halfZ: 10.4, groundY: -0.32 });
    } else {
      const hemi = new HemisphericLight('socken-licht', new Vector3(0.2, 1, -0.4), scene);
      hemi.intensity = 0.62;
      hemi.groundColor = new Color3(0.45, 0.4, 0.55);
      const sun = new DirectionalLight('socken-sonne', new Vector3(-0.35, -1, 0.45), scene);
      sun.intensity = 0.5;
      this.disposables.push(hemi, sun);
    }

    // Aufbau in Schritten, `pace` verteilt ihn auf mehrere Bilder (CHAOS-141).
    await this.buildArena(scene);
    await this.buildMachine(scene);
    await this.buildBubbles(scene);
    for (const player of ctx.players) {
      await ctx.pace();
      this.buildRunner(scene, player);
    }
    // Ein paar Socken vorwärmen, damit mitten im Spiel selten neue Meshes entstehen.
    const warm: ItemKind[] = [
      ...Array<ItemKind>(10).fill('sock'),
      ...Array<ItemKind>(4).fill('iron'),
      'gold',
    ];
    for (const kind of warm) {
      await ctx.pace();
      this.release(this.createItemMeshes(scene, kind));
    }
    this.syncRunners(0);
  }

  start(): void {
    this.running = true;
    this.ctx?.fx.sound('go');
  }

  handleInput(slot: Slot, input: MinigameInput): void {
    const logic = this.logic;
    if (!this.running || !logic) return;
    if (input.type === 'move') {
      logic.setStick(slot, input.x, input.y);
      return;
    }
    if (input.type === 'press' && input.button === 'a' && logic.dash(slot)) {
      const runner = logic.runner(slot);
      this.ctx?.fx.sound('whoosh', { volume: 0.6 });
      if (runner) {
        this.ctx?.fx.burst('dust', { x: runner.x, y: 0.2, z: runner.z });
      }
    }
  }

  update(dtSeconds: number): void {
    const { ctx, logic } = this;
    if (!ctx || !logic) return;
    this.visualTime += dtSeconds;
    if (this.running) {
      for (const event of logic.step(dtSeconds)) this.onEvent(event);
      if (logic.finished) this.finish();
    }
    this.animate(dtSeconds);
  }

  getResult(): MinigameResult | null {
    return this.result;
  }

  getHud(): MinigameHud {
    const logic = this.logic;
    if (!logic) return { remainingMs: SOCKENREGEN_INFO.durationMs, scores: [] };
    const banner = this.result
      ? undefined
      : logic.finale
        ? 'Schleudergang!'
        : logic.time < 1.5
          ? 'Fangt die Socken!'
          : undefined;
    return {
      remainingMs: Math.max(0, Math.round(logic.remainingS * 1000)),
      scores: logic.runners.map((runner) => ({
        slot: runner.slot,
        score: runner.score,
        ...(logic.isStunned(runner) && !this.result ? { status: 'geplättet' } : {}),
      })),
      ...(banner ? { banner } : {}),
    };
  }

  dispose(): void {
    for (const view of this.runners.values()) view.character.dispose();
    this.runners.clear();
    this.itemViews.clear();
    this.pool.length = 0;
    this.bubbles.length = 0;
    this.pupils = [];
    this.drum = null;
    this.machine = null;
    // Rückwärts: Kinder vor ihren Eltern entsorgen.
    for (const item of this.disposables.splice(0).reverse()) item.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.winners.clear();
    this.running = false;
  }

  // ---------------------------------------------------------------------------
  // Spielablauf
  // ---------------------------------------------------------------------------

  private onEvent(event: SockEvent): void {
    const ctx = this.ctx;
    const scene = ctx?.scene;
    if (!ctx || !scene) return;
    switch (event.type) {
      case 'spawn': {
        const meshes = this.acquire(scene, event.item.kind);
        this.itemViews.set(event.item.id, { item: event.item, meshes, lingerUntil: 0 });
        this.machineKick = 1;
        this.lookX = event.item.x;
        if (event.item.kind === 'iron') ctx.fx.sound('whoosh', { volume: 0.35, pitch: 0.7 });
        return;
      }
      case 'land': {
        const { item } = event;
        if (item.kind === 'iron') {
          const view = this.itemViews.get(item.id);
          if (view) view.lingerUntil = this.visualTime + 0.45;
          ctx.fx.sound('bump');
          ctx.fx.burst('impact', { x: item.x, y: 0.1, z: item.z }, PALETTE.danger);
          ctx.fx.shake(0.15);
        }
        return;
      }
      case 'collect': {
        const { item } = event;
        this.releaseItem(item.id);
        const runner = this.runners.get(event.slot);
        if (item.kind === 'gold') {
          ctx.fx.sound('score');
          ctx.fx.burst('sparkle', { x: item.x, y: 1, z: item.z }, PALETTE.gold);
        } else {
          ctx.fx.sound('coin', { pitch: 0.9 + (this.sockCount++ % 5) * 0.05 });
          ctx.fx.burst('stars', { x: item.x, y: 1, z: item.z }, runner?.player.color);
        }
        return;
      }
      case 'hit': {
        const view = this.runners.get(event.slot);
        if (view) view.squash = 1;
        ctx.fx.sound('hit');
        ctx.fx.shake(0.35);
        const runner = this.logic?.runner(event.slot);
        if (runner) ctx.fx.burst('smoke', { x: runner.x, y: 0.5, z: runner.z });
        if (event.drop) {
          this.itemViews.set(event.drop.id, {
            item: event.drop,
            meshes: this.acquire(scene, 'sock'),
            lingerUntil: 0,
          });
          ctx.fx.sound('pop');
        }
        return;
      }
      case 'expire': {
        ctx.fx.burst('smoke', { x: event.item.x, y: 0.2, z: event.item.z });
        this.releaseItem(event.item.id);
        return;
      }
      case 'finale':
        ctx.fx.sound('buzz');
        ctx.fx.shake(0.25);
        return;
      case 'dash':
      case 'end':
        return;
    }
  }

  private finish(): void {
    const { ctx, logic } = this;
    if (!ctx || !logic || this.result) return;
    this.running = false;
    const placements = rankByScore(
      logic.runners.map((runner) => ({ slot: runner.slot, score: runner.score })),
      SOCKENREGEN_INFO.scoring,
    );
    for (const placement of placements) {
      const view = this.runners.get(placement.slot);
      if (!view) continue;
      const animation: CharacterAnimation = placement.place === 1 ? 'cheer' : 'sad';
      view.character.play(animation);
      view.anim = animation;
      view.squash = 0;
      if (placement.place === 1) {
        this.winners.add(placement.slot);
        const runner = logic.runner(placement.slot);
        if (runner) {
          ctx.fx.burst('confetti', { x: runner.x, y: 2, z: runner.z }, view.player.color);
        }
      }
    }
    // Was noch fliegt oder liegt, verpufft.
    for (const id of [...this.itemViews.keys()]) this.releaseItem(id);
    ctx.fx.sound('win');
    const names = new Map(ctx.players.map((player) => [player.slot, player.name]));
    const highlights = sockenregenHighlights(logic, names);
    this.result = {
      minigameId: SOCKENREGEN_INFO.id,
      placements,
      ...(highlights.length > 0 ? { highlights } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Anzeige je Schritt
  // ---------------------------------------------------------------------------

  private animate(dt: number): void {
    const logic = this.logic;
    if (!logic) return;
    const t = this.visualTime;
    this.syncRunners(dt);

    for (const [id, view] of this.itemViews) {
      const { item, meshes } = view;
      if (item.kind === 'iron' && view.lingerUntil > 0) {
        meshes.root.position.set(item.x, 0.12, item.z);
        meshes.root.rotation.set(0, meshes.root.rotation.y, 0);
        meshes.shadow.setEnabled(false);
        meshes.ring.scaling.setAll(1 + (t - view.lingerUntil + 0.45) * 1.5);
        if (t >= view.lingerUntil) this.releaseItem(id);
        continue;
      }
      if (item.state === 'flying') {
        const pos = flightPosition(item, logic.time);
        meshes.root.position.set(pos.x, pos.y, pos.z);
        meshes.root.rotation.set(pos.progress * 9, item.id * 0.7, pos.progress * 4);
        meshes.shadow.setEnabled(true);
        const grow = 0.35 + 0.65 * pos.progress;
        meshes.shadow.scaling.setAll(grow);
        meshes.ring.setEnabled(true);
        meshes.ring.scaling.setAll(item.kind === 'iron' ? 1 : 1.25 - 0.25 * pos.progress);
        meshes.shadow.position.set(item.x, 0.03, item.z);
        meshes.ring.position.set(item.x, 0.04, item.z);
      } else if (item.state === 'ground') {
        const left = item.groundUntil - logic.time;
        const shrink = left < 0.5 ? Math.max(0.2, left / 0.5) : 1;
        const bob = Math.abs(Math.sin((t + item.id) * 6)) * 0.12;
        meshes.root.position.set(item.x, 0.22 + bob, item.z);
        meshes.root.rotation.set(0, item.id + t * 1.5, Math.PI / 2);
        meshes.root.scaling.setAll(shrink * meshes.scale);
        meshes.shadow.setEnabled(false);
        meshes.ring.position.set(item.x, 0.04, item.z);
        meshes.ring.scaling.setAll(0.8 + Math.sin(t * 8) * 0.06);
      }
    }

    // Waschmaschine: wackelt beim Wurf, Trommel dreht, Augen folgen dem Wurf.
    this.machineKick = Math.max(0, this.machineKick - dt * 5);
    if (this.machine) {
      const kick = this.machineKick;
      const shiver = logic.finale && this.running ? Math.sin(t * 40) * 0.025 : 0;
      this.machine.scaling.set(1 + kick * 0.04, 1 - kick * 0.06, 1);
      this.machine.rotation.z = shiver;
    }
    if (this.drum) this.drum.rotation.z += dt * (logic.finale ? 14 : 6);
    for (const [index, pupil] of this.pupils.entries()) {
      const baseX = index === 0 ? -0.75 : 0.75;
      pupil.position.x = baseX + Math.max(-0.14, Math.min(0.14, this.lookX * 0.03));
    }
    for (const [index, bubble] of this.bubbles.entries()) {
      bubble.position.y = 2 + (index % 3) * 0.6 + Math.sin(t * 0.9 + index * 1.7) * 0.4;
    }
  }

  private syncRunners(dt: number): void {
    const logic = this.logic;
    if (!logic) return;
    for (const runner of logic.runners) {
      const view = this.runners.get(runner.slot);
      if (!view) continue;
      const root = view.character.root;
      const hop = this.winners.has(runner.slot) ? Math.abs(Math.sin(this.visualTime * 6)) * 0.7 : 0;
      root.position.set(runner.x, hop, runner.z);
      root.rotation.y = runner.heading;
      view.ring.position.set(runner.x, 0.05, runner.z);
      view.badge.position.set(runner.x, 2.25 + hop, runner.z);
      const stunned = logic.isStunned(runner) && !this.result;
      view.stars.setEnabled(stunned);
      if (stunned) {
        view.stars.position.set(runner.x, 1.25, runner.z);
        view.stars.rotation.y += dt * 7;
      }
      // Geplättet: flach wie Wäsche, dann zurückfedern.
      if (!stunned) view.squash = Math.max(0, view.squash - dt * 4);
      const flat = stunned ? 1 : view.squash;
      root.scaling.set(1 + flat * 0.35, 1 - flat * 0.65, 1 + flat * 0.35);
      if (this.result) continue;
      const moving = Math.hypot(runner.stickX, runner.stickY) > 0.15;
      const desired: CharacterAnimation = stunned
        ? 'fall'
        : logic.isDashing(runner)
          ? 'jump'
          : moving
            ? 'run'
            : 'idle';
      if (desired !== view.anim) {
        view.character.play(desired);
        view.anim = desired;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Aufbau
  // ---------------------------------------------------------------------------

  private material(
    hex: string,
    options: { readonly emissive?: number; readonly alpha?: number } = {},
  ): Material {
    const key = `${hex}|${String(options.emissive ?? 0)}|${String(options.alpha ?? 1)}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const scene = this.ctx?.scene;
    if (!scene) throw new Error('Sockenregen: keine Szene');
    const look = this.ctx?.look;
    if (look) {
      const lookMaterial = look.material(hex, {
        ...(options.emissive !== undefined ? { emissive: options.emissive } : {}),
        ...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
      });
      this.materials.set(key, lookMaterial);
      return lookMaterial;
    }
    const material = new StandardMaterial(`socken-material-${String(this.materials.size)}`, scene);
    const color = Color3.FromHexString(hex);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.12, 0.12, 0.12);
    if (options.emissive) material.emissiveColor = color.scale(options.emissive);
    if (options.alpha !== undefined && options.alpha < 1) material.alpha = options.alpha;
    this.materials.set(key, material);
    return material;
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  /** Bild abgeben, wenn das Aufbau-Budget verbraucht ist (CHAOS-141). */
  private async pace(): Promise<void> {
    await this.ctx?.pace();
  }

  private async buildArena(scene: Scene): Promise<void> {
    const R = SOCKENREGEN_RULES.arenaRadius;
    if (!this.ctx?.look) await this.buildLaundry(scene);
    await this.buildMat(scene, R);
  }

  /** Waschküche ohne Natur-Look: Boden, Wand mit Fliesenstreifen, Wäscheleinen. */
  private async buildLaundry(scene: Scene): Promise<void> {
    await this.pace();
    const floor = this.track(CreateGround('socken-boden', { width: 90, height: 40 }, scene));
    floor.position.set(0, -0.32, 4);
    floor.material = this.material(PALETTE.floor);
    // Waschküchenwand hinter Wumms (verdeckt den Horizont), mit Fliesenstreifen.
    const wall = this.track(CreateBox('socken-wand', { width: 90, height: 24, depth: 0.4 }, scene));
    wall.position.set(0, 11.6, 14.5);
    wall.material = this.material(PALETTE.wall, { emissive: 0.2 });
    const stripe = this.track(
      CreateBox('socken-wand-streifen', { width: 90, height: 1.4, depth: 0.5 }, scene),
    );
    stripe.position.set(0, 1.6, 14.4);
    stripe.material = this.material(PALETTE.machinePanel, { emissive: 0.15 });
    // Wäscheleinen links und rechts von Wumms, mit Socken (Deko).
    for (const side of [-1, 1]) {
      await this.pace();
      const cord = this.track(
        CreateCylinder(`socken-leine-${String(side)}`, { diameter: 0.08, height: 11 }, scene),
      );
      cord.rotation.z = Math.PI / 2;
      cord.position.set(side * 10, 4.6, 14);
      cord.material = this.material(PALETTE.white, { emissive: 0.3 });
      for (let index = 0; index < 4; index++) {
        await this.pace();
        const sock = this.track(
          new TransformNode(`socken-leine-socke-${String(side)}-${String(index)}`, scene),
        );
        sock.position.set(side * (6 + index * 2.4), 3.95, 13.8);
        sock.rotation.y = side < 0 ? Math.PI : 0;
        sock.rotation.z = Math.sin(index * 2.1) * 0.15;
        sock.scaling.setAll(1.2);
        const hex = SOCK_COLORS[(index + (side < 0 ? 0 : 3)) % SOCK_COLORS.length] ?? '#fff';
        this.buildSockBody(scene, sock, `leine-${String(side)}-${String(index)}`, hex, 0.2);
      }
    }
  }

  /** Badvorleger und Wäschekörbe (Spielfläche, in jedem Look). */
  private async buildMat(scene: Scene, R: number): Promise<void> {
    // Badvorleger: Grundscheibe, Streifenringe, dicker gelber Rand.
    await this.pace();
    const mat = this.track(
      CreateCylinder(
        'socken-matte',
        { diameter: R * 2 + 0.6, height: 0.3, tessellation: 64 },
        scene,
      ),
    );
    mat.position.y = -0.15;
    mat.material = this.material(PALETTE.mat, { emissive: 0.08 });
    for (const [index, radius] of [4.8, 2.6].entries()) {
      await this.pace();
      const ring = this.track(
        CreateTorus(
          `socken-matte-streifen-${String(index)}`,
          { diameter: radius * 2, thickness: 0.5, tessellation: 64 },
          scene,
        ),
      );
      ring.scaling.y = 0.05;
      ring.position.y = 0.005;
      ring.material = this.material(PALETTE.matStripe, { emissive: 0.15 });
    }
    await this.pace();
    const rim = this.track(
      CreateTorus(
        'socken-rand',
        { diameter: R * 2 + 0.6, thickness: 0.55, tessellation: 64 },
        scene,
      ),
    );
    rim.position.y = 0.02;
    rim.material = this.material(PALETTE.rim, { emissive: 0.1 });
    // Wäschekörbe links und rechts als Deko.
    for (const side of [-1, 1]) {
      await this.pace();
      const basket = this.track(
        CreateCylinder(
          `socken-korb-${String(side)}`,
          { diameterTop: 2.4, diameterBottom: 1.9, height: 1.3, tessellation: 24 },
          scene,
        ),
      );
      basket.position.set(side * 9.2, 0.33, 2.5);
      basket.material = this.material(side < 0 ? '#ff8fab' : '#8f9bff', { emissive: 0.08 });
      const pile = this.track(
        CreateSphere(`socken-korb-haufen-${String(side)}`, { diameter: 2 }, scene),
      );
      pile.scaling.y = 0.45;
      pile.position.set(side * 9.2, 1.0, 2.5);
      pile.material = this.material(side < 0 ? SOCK_COLORS[2] : SOCK_COLORS[3], { emissive: 0.1 });
    }
  }

  private async buildMachine(scene: Scene): Promise<void> {
    await this.pace();
    const machine = this.track(
      markVisual(new TransformNode('socken-wumms', scene), 'waschmaschine'),
    );
    machine.position.set(0, 0, LAUNCH_POINT.z + 1.45);
    this.machine = machine;
    const part = <T extends Mesh>(mesh: T, hex: string, emissive = 0.05): T => {
      this.track(mesh);
      mesh.parent = machine;
      mesh.material = this.material(hex, { emissive });
      return mesh;
    };
    const body = part(
      CreateBox('socken-wumms-koerper', { width: 5.2, height: 4.4, depth: 2.6 }, scene),
      PALETTE.machine,
      0.3,
    );
    body.position.y = 2.45;
    const panel = part(
      CreateBox('socken-wumms-blende', { width: 5.4, height: 0.8, depth: 2.8 }, scene),
      PALETTE.machinePanel,
      0.12,
    );
    panel.position.y = 4.95;
    await this.pace();
    ['#ff6b6b', '#ffd43b', '#4dabf7'].forEach((hex, index) => {
      const knob = part(
        CreateCylinder(
          `socken-wumms-knopf-${String(index)}`,
          { diameter: 0.45, height: 0.2 },
          scene,
        ),
        hex,
        0.2,
      );
      knob.rotation.x = Math.PI / 2;
      knob.position.set(1.0 + index * 0.65, 4.95, -1.45);
    });
    const front = -1.32;
    await this.pace();
    const door = part(
      CreateTorus('socken-wumms-tuer', { diameter: 2.7, thickness: 0.38, tessellation: 40 }, scene),
      PALETTE.chrome,
      0.15,
    );
    door.rotation.x = Math.PI / 2;
    door.position.set(0, 2.3, front);
    const drum = this.track(new TransformNode('socken-wumms-trommel', scene));
    drum.parent = machine;
    drum.position.set(0, 2.3, front + 0.25);
    this.drum = drum;
    for (const [index, hex] of SOCK_COLORS.slice(0, 4).entries()) {
      await this.pace();
      const blob = this.track(
        CreateSphere(`socken-wumms-waesche-${String(index)}`, { diameter: 0.75 }, scene),
      );
      blob.parent = drum;
      const a = (index / 4) * Math.PI * 2;
      blob.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.1);
      blob.material = this.material(hex, { emissive: 0.15 });
    }
    await this.pace();
    const glass = part(
      CreateCylinder('socken-wumms-glas', { diameter: 2.4, height: 0.08, tessellation: 40 }, scene),
      PALETTE.glass,
      0.2,
    );
    glass.material = this.material(PALETTE.glass, { emissive: 0.25, alpha: 0.45 });
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, 2.3, front - 0.05);
    // Glupschaugen oben auf der Blende.
    for (const [index, x] of [-0.75, 0.75].entries()) {
      await this.pace();
      const eye = part(
        CreateSphere(`socken-wumms-auge-${String(index)}`, { diameter: 1.05 }, scene),
        PALETTE.white,
        0.35,
      );
      eye.position.set(x, 5.75, -0.6);
      await this.pace();
      const pupil = part(
        CreateSphere(`socken-wumms-pupille-${String(index)}`, { diameter: 0.45 }, scene),
        PALETTE.dark,
      );
      pupil.position.set(x, 5.65, -1.05);
      this.pupils.push(pupil);
    }
    await this.pace();
    [-2, 2].forEach((x, index) => {
      [-0.9, 0.9].forEach((z, row) => {
        const foot = part(
          CreateCylinder(
            `socken-wumms-fuss-${String(index)}-${String(row)}`,
            { diameter: 0.5, height: 0.35 },
            scene,
          ),
          PALETTE.dark,
        );
        foot.position.set(x, 0.1, z);
      });
    });
  }

  private async buildBubbles(scene: Scene): Promise<void> {
    const spots: readonly [number, number, number][] = [
      [-8.5, -1.5, 1.1],
      [-7.2, 6.5, 0.8],
      [8.3, -2.8, 0.9],
      [7.6, 6.2, 1.3],
      [-4.4, 9.5, 0.7],
      [4.6, 10, 0.9],
    ];
    for (const [index, [x, z, size]] of spots.entries()) {
      await this.pace();
      const bubble = this.track(
        CreateSphere(`socken-blase-${String(index)}`, { diameter: size, segments: 12 }, scene),
      );
      bubble.position.set(x, 1.5, z);
      bubble.material = this.material(PALETTE.bubble, { emissive: 0.8, alpha: 0.5 });
      const shine = this.track(
        CreateSphere(
          `socken-blase-glanz-${String(index)}`,
          { diameter: size * 0.22, segments: 6 },
          scene,
        ),
      );
      shine.parent = bubble;
      shine.position.set(-size * 0.22, size * 0.24, -size * 0.3);
      shine.material = this.material(PALETTE.white, { emissive: 1 });
      markVisual(bubble, 'seifenblase', index);
      this.bubbles.push(bubble);
    }
  }

  private buildRunner(scene: Scene, player: MinigamePlayer): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const character = ctx.characters.create(scene, player);
    const ring = this.track(
      CreateTorus(
        `socken-ring-${String(player.slot)}`,
        { diameter: SOCKENREGEN_RULES.catchRadius * 2, thickness: 0.16, tessellation: 40 },
        scene,
      ),
    );
    markVisual(ring, 'fangring', player.slot);
    ring.material = this.material(player.color, { emissive: 0.2 });
    const spot = this.track(
      CreateDisc(
        `socken-fleck-${String(player.slot)}`,
        { radius: SOCKENREGEN_RULES.catchRadius, tessellation: 40 },
        scene,
      ),
    );
    spot.rotation.x = Math.PI / 2;
    spot.parent = ring;
    spot.material = this.material(player.color, { emissive: 0.3, alpha: 0.45 });
    // Schwebendes Slot-Symbol (Farbe + Form, auch ohne Farbsehen lesbar).
    const badge = this.track(new TransformNode(`socken-abzeichen-${String(player.slot)}`, scene));
    markVisual(badge, 'abzeichen', player.slot);
    badge.billboardMode = TransformNode.BILLBOARDMODE_ALL;
    const plate = this.track(
      CreateDisc(
        `socken-abzeichen-platte-${String(player.slot)}`,
        { radius: 0.36, tessellation: 32 },
        scene,
      ),
    );
    plate.parent = badge;
    plate.material = this.material(PALETTE.white, { emissive: 0.6 });
    const symbol = this.track(
      symbolMesh(scene, `socken-symbol-${String(player.slot)}`, player.symbol),
    );
    symbol.parent = badge;
    symbol.position.z = -0.01;
    symbol.material = this.material(player.color, { emissive: 0.5 });
    plate.material.backFaceCulling = false;
    symbol.material.backFaceCulling = false;
    const stars = this.track(new TransformNode(`socken-sterne-${String(player.slot)}`, scene));
    for (let index = 0; index < 3; index++) {
      const star = this.track(
        CreateSphere(
          `socken-stern-${String(player.slot)}-${String(index)}`,
          { diameter: 0.28, segments: 6 },
          scene,
        ),
      );
      star.parent = stars;
      const a = (index / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * 0.55, 0.15 * index, Math.sin(a) * 0.55);
      star.material = this.material(PALETTE.star, { emissive: 0.6 });
    }
    markVisual(stars, 'sterne', player.slot);
    stars.setEnabled(false);
    this.runners.set(player.slot, {
      slot: player.slot,
      player,
      character,
      ring,
      badge,
      stars,
      anim: null,
      squash: 0,
    });
  }

  private acquire(scene: Scene, kind: ItemKind): ItemMeshes {
    const index = this.pool.findIndex((meshes) => meshes.kind === kind);
    const meshes = index >= 0 ? this.pool.splice(index, 1)[0] : undefined;
    const ready = meshes ?? this.createItemMeshes(scene, kind);
    ready.root.setEnabled(true);
    ready.shadow.setEnabled(true);
    ready.ring.setEnabled(true);
    ready.root.scaling.setAll(ready.scale);
    return ready;
  }

  private release(meshes: ItemMeshes): void {
    meshes.root.setEnabled(false);
    meshes.shadow.setEnabled(false);
    meshes.ring.setEnabled(false);
    this.pool.push(meshes);
  }

  private releaseItem(id: number): void {
    const view = this.itemViews.get(id);
    if (!view) return;
    this.itemViews.delete(id);
    this.release(view.meshes);
  }

  private createItemMeshes(scene: Scene, kind: ItemKind): ItemMeshes {
    const n = String(this.disposables.length);
    const role = kind === 'iron' ? 'buegeleisen' : kind === 'gold' ? 'goldsocke' : 'socke';
    const root = this.track(markVisual(new TransformNode(`socken-ding-${n}`, scene), role, n));
    const add = (mesh: Mesh, hex: string, emissive = 0.12): Mesh => {
      this.track(mesh);
      mesh.parent = root;
      mesh.material = this.material(hex, { emissive });
      return mesh;
    };
    if (kind === 'iron') {
      const sole = add(
        CreateCylinder(
          `socken-eisen-sohle-${n}`,
          { diameter: 1.3, height: 0.3, tessellation: 3 },
          scene,
        ),
        PALETTE.iron,
        0.15,
      );
      sole.scaling.set(0.8, 1, 1.2);
      sole.rotation.y = Math.PI / 2;
      const body = add(
        CreateCylinder(
          `socken-eisen-koerper-${n}`,
          { diameter: 1.05, height: 0.25, tessellation: 3 },
          scene,
        ),
        PALETTE.ironHandle,
        0.2,
      );
      body.scaling.set(0.7, 1, 1.05);
      body.rotation.y = Math.PI / 2;
      body.position.y = 0.26;
      const handle = add(
        CreateBox(`socken-eisen-griff-${n}`, { width: 0.18, height: 0.18, depth: 0.75 }, scene),
        PALETTE.dark,
      );
      handle.position.y = 0.65;
      const post = add(
        CreateBox(`socken-eisen-stiel-${n}`, { width: 0.16, height: 0.35, depth: 0.16 }, scene),
        PALETTE.dark,
      );
      post.position.set(0, 0.48, -0.25);
    } else {
      const hex =
        kind === 'gold'
          ? PALETTE.gold
          : (SOCK_COLORS[this.sockCount++ % SOCK_COLORS.length] ?? '#fff');
      this.buildSockBody(scene, root, n, hex, kind === 'gold' ? 0.55 : 0.15);
    }
    const iron = kind === 'iron';
    const shadow = this.track(
      CreateDisc(
        `socken-schatten-${n}`,
        { radius: iron ? SOCKENREGEN_RULES.ironRadius : 0.55, tessellation: 40 },
        scene,
      ),
    );
    markVisual(shadow, `${role}-schatten`, n);
    shadow.rotation.x = Math.PI / 2;
    shadow.material = iron
      ? this.material(PALETTE.danger, { emissive: 0.4, alpha: 0.4 })
      : this.material(PALETTE.dark, { alpha: 0.3 });
    const ring = this.track(
      CreateTorus(
        `socken-zielring-${n}`,
        {
          diameter: iron ? SOCKENREGEN_RULES.ironRadius * 2 : 1.3,
          thickness: iron ? 0.16 : 0.1,
          tessellation: 40,
        },
        scene,
      ),
    );
    ring.material = this.material(
      iron ? PALETTE.danger : kind === 'gold' ? PALETTE.gold : PALETTE.white,
      { emissive: 0.6 },
    );
    markVisual(ring, `${role}-zielring`, n);
    return { kind, scale: iron ? 1.5 : 1.35, root, shadow, ring };
  }

  /** Socke aus Schaft, Fuß, Bund und Spitze (Bund oben, Fuß zeigt nach +z). */
  private buildSockBody(scene: Scene, root: TransformNode, n: string, hex: string, glow: number) {
    const add = (mesh: Mesh, color: string, emissive: number): Mesh => {
      this.track(mesh);
      mesh.parent = root;
      mesh.material = this.material(color, { emissive });
      return mesh;
    };
    const leg = add(
      CreateCapsule(`socken-schaft-${n}`, { height: 0.95, radius: 0.22 }, scene),
      hex,
      glow,
    );
    leg.position.y = 0.1;
    const foot = add(
      CreateCapsule(`socken-fuss-${n}`, { height: 0.75, radius: 0.22 }, scene),
      hex,
      glow,
    );
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.32, 0.22);
    const cuff = add(
      CreateTorus(`socken-bund-${n}`, { diameter: 0.44, thickness: 0.14, tessellation: 20 }, scene),
      PALETTE.white,
      0.3,
    );
    cuff.position.y = 0.52;
    const toe = add(
      CreateSphere(`socken-spitze-${n}`, { diameter: 0.42, segments: 8 }, scene),
      PALETTE.white,
      0.3,
    );
    toe.position.set(0, -0.32, 0.5);
  }
}

/** Flaches Slot-Symbol (● ▲ ■ ★) als Mesh in der x/y-Ebene, Blick −z. */
function symbolMesh(scene: Scene, name: string, symbol: string): Mesh {
  const outline: [number, number][] = [];
  const radius = 0.26;
  if (symbol === '▲') {
    for (let index = 0; index < 3; index++) {
      const a = Math.PI / 2 + (index * 2 * Math.PI) / 3;
      outline.push([Math.cos(a) * radius * 1.15, Math.sin(a) * radius * 1.15 - 0.03]);
    }
  } else if (symbol === '■') {
    const s = radius * 0.8;
    outline.push([-s, -s], [s, -s], [s, s], [-s, s]);
  } else if (symbol === '★') {
    for (let index = 0; index < 10; index++) {
      const a = Math.PI / 2 + (index * Math.PI) / 5;
      const r = index % 2 === 0 ? radius * 1.15 : radius * 0.48;
      outline.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  } else {
    for (let index = 0; index < 28; index++) {
      const a = (index / 28) * Math.PI * 2;
      outline.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
  }
  // Fächer um die Mitte (alle Formen sind sternförmig um den Ursprung).
  const positions = [0, 0, 0];
  for (const [x, y] of outline) positions.push(x, y, 0);
  const indices: number[] = [];
  for (let index = 0; index < outline.length; index++) {
    indices.push(0, 1 + ((index + 1) % outline.length), 1 + index);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

export const sockenregen: MinigameModule = {
  info: SOCKENREGEN_INFO,
  create: () => new Sockenregen(),
};
