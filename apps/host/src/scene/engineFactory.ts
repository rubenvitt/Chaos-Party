/**
 * Grafik-Schnittstelle der Host-Szenen (CHAOS-75, Renderer-Spike): WebGL2 wie bisher oder
 * WebGPU über Babylons `WebGPUEngine` (`?gpu=webgpu`). Babylon 9 bringt alle Kern-Shader auch
 * als WGSL mit; glslang/twgsl (sonst vom CDN) lädt die Engine nur für GLSL-Shader nach, die
 * der Spielpfad nicht hat.
 *
 * Bisher nutzt nur das Brett diese Fabrik (Testszene des Spikes). Arena, Minispiel-Bühne,
 * Vorschau und Podest erzeugen ihre Engine weiter synchron mit WebGL2; ein Umstieg bräuchte
 * dort denselben asynchronen Start (siehe ADR-016-Entwurf).
 */
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import type { GpuBackend } from '../config.ts';
import type { RendererInfo } from './types.ts';

export interface HostEngineOptions {
  /** Testmodus: Zeichenpuffer bleibt lesbar, Gerätepixelverhältnis 1. */
  readonly testMode: boolean;
  readonly backend: GpuBackend;
}

/** Ergebnis inklusive Rückfall: Ohne WebGPU-Adapter läuft die Szene mit WebGL2 weiter. */
export interface HostEngine {
  readonly engine: AbstractEngine;
  readonly backend: GpuBackend;
  /** Warum WebGPU nicht ging (nur bei Rückfall). */
  readonly fallbackReason?: string;
}

/** Synchrone WebGL2-Engine wie bisher in allen Szenen. */
export function createWebGlEngine(canvas: HTMLCanvasElement, testMode: boolean): Engine {
  return new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: testMode, stencil: true },
    // Im Test feste Auflösung (Gerätepixelverhältnis 1), sonst scharf auf HiDPI.
    !testMode,
  );
}

/**
 * Engine für eine Host-Szene. WebGPU braucht einen asynchronen Start (Adapter und Gerät);
 * schlägt er fehl, fällt die Szene auf WebGL2 zurück und meldet den Grund.
 */
export async function createHostEngine(
  canvas: HTMLCanvasElement,
  options: HostEngineOptions,
): Promise<HostEngine> {
  if (options.backend === 'webgpu') {
    const reason = webGpuUnavailableReason();
    if (reason === null) {
      try {
        // Dynamisch: Der WebGL-Pfad lädt den WebGPU-Code nicht mit.
        const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine.js');
        const engine = new WebGPUEngine(canvas, {
          antialias: true,
          stencil: true,
          adaptToDeviceRatio: !options.testMode,
          powerPreference: 'high-performance',
        });
        await engine.initAsync();
        return { engine, backend: 'webgpu' };
      } catch (error) {
        return {
          engine: createWebGlEngine(canvas, options.testMode),
          backend: 'webgl',
          fallbackReason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return {
      engine: createWebGlEngine(canvas, options.testMode),
      backend: 'webgl',
      fallbackReason: reason,
    };
  }
  return { engine: createWebGlEngine(canvas, options.testMode), backend: 'webgl' };
}

/** `null`, wenn der Browser WebGPU anbietet; sonst der Grund. Den Adapter holt `initAsync`. */
function webGpuUnavailableReason(): string | null {
  // Laut DOM-Typen gibt es `navigator.gpu` immer; ältere Browser und CI-Chromium haben es nicht.
  const gpu: unknown = Reflect.get(navigator, 'gpu');
  return gpu ? null : 'Browser bietet kein navigator.gpu';
}

interface AdapterInfo {
  readonly vendor: string;
  readonly renderer: string;
  readonly version: string;
}

/** Adapter-Angaben der WebGPU-Engine (`getInfo` gibt es dort, aber nicht auf `AbstractEngine`). */
function adapterInfo(engine: AbstractEngine): AdapterInfo | undefined {
  return (engine as AbstractEngine & { getInfo?: () => AdapterInfo }).getInfo?.();
}

/** Name der Grafikkarte für Messanzeige und Grafik-Automatik (erkennt Software-Rendering). */
export function rendererName(engine: AbstractEngine): string {
  if (engine instanceof Engine) return engine.getGlInfo().renderer;
  const info = adapterInfo(engine);
  return info ? `${info.vendor} ${info.renderer} ${info.version}`.trim() : 'unbekannt';
}

/** Kennzahlen der Grafik-Schnittstelle für `getRendererInfo()`. */
export function rendererInfo(
  engine: AbstractEngine,
): Pick<RendererInfo, 'webgl' | 'api' | 'renderer' | 'vendor' | 'width' | 'height'> {
  const size = { width: engine.getRenderWidth(), height: engine.getRenderHeight() };
  if (engine instanceof Engine) {
    const gl = engine.getGlInfo();
    return {
      webgl: engine.webGLVersion,
      api: `WebGL${String(engine.webGLVersion)}`,
      renderer: gl.renderer,
      vendor: gl.vendor,
      ...size,
    };
  }
  const info = adapterInfo(engine);
  return {
    webgl: 0,
    api: 'WebGPU',
    renderer: info ? `${info.renderer} ${info.version}`.trim() : 'unbekannt',
    vendor: info?.vendor ?? 'unbekannt',
    ...size,
  };
}
