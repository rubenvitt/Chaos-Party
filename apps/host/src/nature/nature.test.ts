import { beforeEach, describe, expect, it } from 'vitest';
import { fbm, seeded } from './noise.ts';
import {
  ADAPT,
  createAdaptiveQuality,
  isSoftwareRenderer,
  lowerLevel,
  parseQualityLevel,
  QUALITY,
  QUALITY_LEVELS,
  renderScalingLevel,
  resetSessionQuality,
  sessionQuality,
} from './quality.ts';
import { parseLookSettings } from './settings.ts';
import { createTerrain, rimRadius } from './terrain.ts';
import { bundledNatureAssets, NATURE_TEXTURES } from './assets.ts';
import { LIGHT_MOODS } from '../lighting/moods.ts';

describe('Rauschen', () => {
  it('ist deterministisch und bleibt in 0…1', () => {
    const a = seeded(57);
    const b = seeded(57);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    for (let i = 0; i < 200; i++) {
      const n = fbm(i * 0.37, 1, i * 0.11);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe('Gelände', () => {
  const shape = { centerX: 0, centerZ: 0, halfX: 20, halfZ: 10, squareness: 4 };

  it('Rand liegt nahe der halben Ausdehnung (Wellenrand nur wenige Prozent)', () => {
    expect(rimRadius(shape, 0)).toBeGreaterThan(20 * 0.9);
    expect(rimRadius(shape, 0)).toBeLessThan(20 * 1.1);
    expect(rimRadius(shape, Math.PI / 2)).toBeGreaterThan(10 * 0.9);
    expect(rimRadius(shape, Math.PI / 2)).toBeLessThan(10 * 1.1);
  });

  it('Stellflächen sind exakt eben, Mulden tiefer, außerhalb nichts', () => {
    const terrain = createTerrain({
      shape,
      flats: [{ x: 5, z: 2, radius: 1 }],
      hollows: [{ x: -8, z: 0, rx: 2, rz: 1.5, depth: 0.5 }],
    });
    expect(terrain.height(5, 2)).toBe(0);
    expect(terrain.height(5.7, 2.3)).toBe(0);
    expect(terrain.height(-8, 0)).toBeLessThan(-0.2);
    expect(terrain.inside(0, 0)).toBe(true);
    expect(terrain.inside(0, 9.5, 2)).toBe(false);
    expect(terrain.inside(30, 0)).toBe(false);
  });

  it('Hügel bleiben flach genug für Gras und Figuren', () => {
    const terrain = createTerrain({ shape });
    for (let x = -15; x <= 15; x += 1.5) {
      for (let z = -7; z <= 7; z += 1.5) {
        expect(Math.abs(terrain.height(x, z))).toBeLessThan(0.8);
      }
    }
  });
});

describe('Grafikstufen', () => {
  beforeEach(resetSessionQuality);

  it('werden von hoch nach niedrig billiger', () => {
    const [hoch, mittel, niedrig] = QUALITY_LEVELS.map((l) => QUALITY[l]);
    expect(hoch?.grass).toBeGreaterThan(mittel?.grass ?? 1);
    expect(mittel?.grass).toBeGreaterThan(niedrig?.grass ?? 1);
    expect(hoch?.ssao).toBe(true);
    expect(niedrig?.ssao).toBe(false);
    expect(niedrig?.depthOfField).toBe(false);
    expect(QUALITY.minimal.ssao).toBe(false);
    expect(QUALITY.minimal.environment).toBe(false);
    expect(QUALITY.minimal.postProcess).toBe(false);
    expect(hoch?.maxRenderPixels).toBeGreaterThan(mittel?.maxRenderPixels ?? Infinity);
    expect(mittel?.maxRenderPixels).toBeGreaterThan(niedrig?.maxRenderPixels ?? Infinity);
  });

  it('Renderauflösung: nativ bis zur Grenze, darüber kleiner', () => {
    const fullHd = 1920 * 1080;
    // 1080p, DPR 1: unter der Grenze nativ.
    expect(renderScalingLevel(1920, 1080, 1, fullHd)).toBe(1);
    // 1080p-Fenster mit DPR 2 (4K): auf 1080p begrenzt.
    expect(renderScalingLevel(1920, 1080, 2, fullHd)).toBeCloseTo(1);
    // 4K mit DPR 1 (Fernseher): halbe Kantenlänge.
    expect(renderScalingLevel(3840, 2160, 1, fullHd)).toBeCloseTo(2);
    // HiDPI unter der Grenze bleibt scharf; ohne Grenze oder Größe nativ.
    expect(renderScalingLevel(800, 600, 2, fullHd)).toBe(0.5);
    expect(renderScalingLevel(3840, 2160, 2, Infinity)).toBe(0.5);
    expect(renderScalingLevel(0, 0, 2, fullHd)).toBe(0.5);
  });

  it('URL-Werte und Abstufung', () => {
    expect(parseQualityLevel('mittel')).toBe('mittel');
    expect(parseQualityLevel('ultra')).toBeNull();
    expect(parseQualityLevel(null)).toBeNull();
    expect(lowerLevel('hoch')).toBe('mittel');
    expect(lowerLevel('niedrig')).toBeNull();
    expect(lowerLevel('minimal')).toBeNull();
    expect(parseQualityLevel('minimal')).toBe('minimal');
  });

  /** `seconds` Sekunden lang Bilder mit `fps`; liefert alle Stufenwechsel. */
  function run(quality: ReturnType<typeof createAdaptiveQuality>, fps: number, seconds: number) {
    const changes: string[] = [];
    for (let t = 0; t < seconds * fps; t++) {
      const next = quality.frame(1000 / fps);
      if (next) changes.push(next);
    }
    return changes;
  }

  it('Automatik stuft bei niedriger Bildrate ab, aber erst nach der Anlaufzeit', () => {
    const quality = createAdaptiveQuality('hoch', true);
    // Anlaufzeit plus knapp ein Fenster: noch keine Entscheidung.
    expect(run(quality, 30, (ADAPT.settleMs + ADAPT.windowMs) / 1000 - 0.2)).toEqual([]);
    expect(run(quality, 30, 0.5)).toEqual(['mittel']);
    // Nach dem Wechsel wieder Anlaufzeit, dann weiter nach unten bis zum Boden.
    expect(run(quality, 30, 30)).toEqual(['niedrig']);
    expect(quality.level).toBe('niedrig');
  });

  it('Automatik merkt sich die Stufe für die nächste Szene der Sitzung', () => {
    expect(sessionQuality()).toBeNull();
    run(createAdaptiveQuality('hoch', true), 30, 8);
    expect(sessionQuality()).toBe('mittel');
    // Feste Stufen ändern die Sitzung nicht.
    run(createAdaptiveQuality('niedrig', false), 20, 30);
    expect(sessionQuality()).toBe('mittel');
    const gpu = { testMode: false, boardId: 'wackelwald', renderer: 'ANGLE (Apple, M3)' };
    expect(parseLookSettings('', { ...gpu, sessionQuality: 'mittel' })).toMatchObject({
      quality: 'mittel',
      automatic: true,
    });
    expect(parseLookSettings('?qualitaet=hoch', { ...gpu, sessionQuality: 'mittel' }).quality).toBe(
      'hoch',
    );
  });

  it('Automatik bleibt bei flüssiger Bildrate, ohne Automatik und bei Pausen', () => {
    const fast = createAdaptiveQuality('hoch', true);
    expect(run(fast, 60, 30)).toEqual([]);
    const fixed = createAdaptiveQuality('hoch', false);
    expect(run(fixed, 20, 30)).toEqual([]);
    const paused = createAdaptiveQuality('hoch', true);
    for (let i = 0; i < 100; i++) expect(paused.frame(2000)).toBeNull();
  });
});

describe('Einstellungen des Natur-Looks', () => {
  const board = { testMode: false, boardId: 'wackelwald' };
  const gpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)';
  const swiftshader =
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';

  it('Standard: Stimmung des Bretts, hoch mit Automatik', () => {
    const look = parseLookSettings('', { ...board, renderer: gpu });
    expect(look.mood.id).toBe('abend');
    expect(look.quality).toBe('hoch');
    expect(look.automatic).toBe(true);
  });

  it('URL überschreibt Stimmung und Stufe; Testmodus und Software-Rendering sparen', () => {
    expect(parseLookSettings('?stimmung=nacht&qualitaet=mittel', board)).toMatchObject({
      mood: { id: 'nacht' },
      quality: 'mittel',
      automatic: false,
    });
    expect(parseLookSettings('?stimmung=quatsch', board).mood.id).toBe('abend');
    expect(parseLookSettings('', { ...board, testMode: true }).quality).toBe('minimal');
    expect(parseLookSettings('?qualitaet=hoch', { ...board, testMode: true }).quality).toBe(
      'minimal',
    );
    expect(parseLookSettings('', { ...board, renderer: swiftshader })).toMatchObject({
      quality: 'minimal',
      software: true,
    });
    expect(parseLookSettings('', { ...board, renderer: gpu }).software).toBe(false);
    expect(parseLookSettings('?qualitaet=hoch', { ...board, renderer: swiftshader }).quality).toBe(
      'hoch',
    );
    expect(isSoftwareRenderer(gpu)).toBe(false);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
  });

  it('Lobby und Siegerehrung: feste Stimmung, Runde zählt nicht, URL gewinnt (CHAOS-77)', () => {
    const late = { round: 5, rounds: 5 };
    expect(parseLookSettings('', { ...board, round: late, scene: 'lobby' })).toMatchObject({
      mood: { id: 'abend' },
      fixedMood: true,
    });
    expect(parseLookSettings('', { ...board, scene: 'finale' }).mood.id).toBe('nacht');
    expect(parseLookSettings('?stimmung=morgen', { ...board, scene: 'finale' }).mood.id).toBe(
      'morgen',
    );
    expect(parseLookSettings('', { ...board, scene: 'lobby', testMode: true }).quality).toBe(
      'minimal',
    );
  });
});

describe('Natur-Assets im Build', () => {
  it('jede Textur und jeder Himmel der Stimmungen ist gebündelt', () => {
    const { textures, skies } = bundledNatureAssets();
    for (const id of NATURE_TEXTURES) {
      for (const map of ['diff', 'nor', 'arm']) expect(textures).toContain(`${id}_${map}`);
    }
    for (const mood of Object.values(LIGHT_MOODS)) expect(skies).toContain(mood.sky.hdri);
  });
});
