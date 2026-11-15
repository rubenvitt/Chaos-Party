/**
 * Figuren im Host (CHAOS-27). **Platzhalter des Koordinators**: Die Schnittstelle ist fest,
 * die Umsetzung (GLB-Figuren aus `packages/assets`) liefert die Asset-Aufgabe.
 *
 * `loadCharacters(scene)` lädt alle Figuren für **eine** Szene vor (asynchron); danach
 * erzeugt `create()` Figuren synchron (Vertrag `CharacterFactory` aus dem minigame-sdk).
 * `dispose()` entfernt alles Vorgeladene aus der Szene. Brett, Lobby und Minispiele nutzen
 * dieselbe Bibliothek.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { CharacterFactory, CharacterHandle } from '@chaos-party/minigame-sdk/babylon';

export interface CharacterLibrary extends CharacterFactory {
  dispose(): void;
}

export function loadCharacters(scene: Scene): Promise<CharacterLibrary> {
  const library: CharacterLibrary = {
    create(target, player): CharacterHandle {
      if (target !== scene) throw new Error('Figur gehört zu einer anderen Szene');
      const root = new TransformNode(`figur-${player.slot}`, target);
      const body = CreateCapsule(
        `figur-${player.slot}-koerper`,
        { height: 1.6, radius: 0.4 },
        target,
      );
      body.position.y = 0.8;
      body.parent = root;
      const material = new StandardMaterial(`figur-${player.slot}-material`, target);
      material.diffuseColor = Color3.FromHexString(player.color);
      body.material = material;
      return {
        root,
        id: player.character,
        play: () => undefined,
        dispose: () => {
          material.dispose();
          body.dispose();
          root.dispose();
        },
      };
    },
    dispose: () => undefined,
  };
  return Promise.resolve(library);
}
