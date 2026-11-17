import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';
import { markVisual, visualOf } from './visual.ts';

describe('markVisual / visualOf', () => {
  const scene = new Scene(new NullEngine());

  it('vererbt die Kennung an Kinder; der nächste Vorfahr gewinnt', () => {
    const root = markVisual(new TransformNode('turm', scene), 'turm', 2);
    const piece = markVisual(new TransformNode('stueck', scene), 'toertchen');
    const leaf = new TransformNode('guss', scene);
    piece.parent = root;
    leaf.parent = piece;
    expect(visualOf(root)).toEqual({ role: 'turm', key: '2' });
    expect(visualOf(leaf)).toEqual({ role: 'toertchen' });
    expect(visualOf(new TransformNode('kulisse', scene))).toBeUndefined();
  });

  it('lässt vorhandene Metadaten stehen', () => {
    const node = new TransformNode('x', scene);
    node.metadata = { andere: 1 };
    markVisual(node, 'socke', 'a');
    expect(node.metadata).toMatchObject({ andere: 1 });
    expect(visualOf(node)).toEqual({ role: 'socke', key: 'a' });
  });
});
