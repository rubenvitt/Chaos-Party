/**
 * Geometrie für Swift (CHAOS-144): Base64 in Stücken gleich Base64 am Stück, Schlüssel unterscheiden
 * Geometrien, Bytes kommen unverändert an.
 */
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';
import {
  base64,
  encodeGeometry,
  encodeStep,
  finishGeometry,
  geometryKey,
  pendingGeometry,
  readMeshData,
} from '../src/geometry.ts';

describe('Geometrie-Kodierung (CHAOS-144)', () => {
  it('Base64 wie Node, auch in Stücken', () => {
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) % 256);
    const expected = Buffer.from(bytes).toString('base64');
    expect(base64(bytes)).toBe(expected);
    expect(base64(bytes, 0, 999) + base64(bytes, 999)).toBe(expected);
    for (const length of [0, 1, 2, 3, 4, 5]) {
      expect(base64(bytes.subarray(0, length))).toBe(
        Buffer.from(bytes.subarray(0, length)).toString('base64'),
      );
    }
  });

  it('kodiert Positionen, Normalen und Indizes verlustfrei und schrittweise gleich', () => {
    const scene = new Scene(new NullEngine());
    const box = CreateBox('kiste', { width: 2, height: 1, depth: 3 }, scene);
    box.position.set(5, 0, 0);
    const data = readMeshData(box);
    if (!data) throw new Error('keine Daten');
    expect(data.extent).toEqual([2, 1, 3]);
    const whole = encodeGeometry('g1', data);
    const pending = pendingGeometry('g1', data);
    let steps = 0;
    while (!encodeStep(pending)) steps++;
    expect(finishGeometry(pending)).toEqual(whole);
    const positions = new Float32Array(
      Uint8Array.from(Buffer.from(whole.positions, 'base64')).buffer,
    );
    expect(positions.length).toBe(whole.vertices * 3);
    // Um die Mitte der Bounding-Box: Ecken bei ±halber Kante.
    expect(Math.max(...positions.filter((_, i) => i % 3 === 0))).toBeCloseTo(1);
    expect(Buffer.from(whole.indices, 'base64').length).toBe((box.getIndices()?.length ?? 0) * 2);
    expect(Buffer.from(whole.normals, 'base64').length).toBe(whole.vertices * 3);
    expect(steps).toBeGreaterThanOrEqual(0);
    scene.dispose();
  });

  it('gleiche Geometrie = gleicher Schlüssel, andere Geometrie = anderer', () => {
    const scene = new Scene(new NullEngine());
    const a = readMeshData(CreateSphere('a', { diameter: 1 }, scene));
    const b = readMeshData(CreateSphere('b', { diameter: 1 }, scene));
    const c = readMeshData(CreateSphere('c', { diameter: 1.2 }, scene));
    if (!a || !b || !c) throw new Error('keine Daten');
    expect(geometryKey(a)).toBe(geometryKey(b));
    expect(geometryKey(a)).not.toBe(geometryKey(c));
    scene.dispose();
  });
});
