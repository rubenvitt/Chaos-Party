/**
 * Randmarker im PC-HUD (CHAOS-210): je Figur außerhalb des Bilds ein Tropfen in Slot-Farbe mit
 * Symbol, die Spitze zeigt zur Figur. Lage, Richtung und Ein-/Ausblenden rechnet die gemeinsame
 * Regie (`edgeMarkers.ts`); hier wird nur gesetzt. Die Szene meldet die Marker je Takt
 * (`onEdgeMarkers`), die Elemente bekommen ihre Werte direkt, ohne React-Rendern je Bild.
 */
import { PLAYER_SLOTS, type SlotNumber } from '@chaos-party/protocol';
import { useEffect, useRef, type CSSProperties } from 'react';
import type { EdgeMarker } from './edgeMarkers.ts';
import type { BoardScene } from './types.ts';

const SLOTS: readonly SlotNumber[] = [1, 2, 3, 4];

/**
 * Tropfen mit Spitze nach rechts (0 rad), Kreis um die Mitte des 100er-Felds. Die Spitze liegt
 * 46 vor der Mitte, die Flanken berühren den Kreis (Radius 34) tangential.
 */
export const MARKER_PATH = 'M 96 50 L 75.2 27.1 A 34 34 0 1 0 75.2 72.9 Z';

function apply(element: HTMLElement, marker: EdgeMarker | undefined): void {
  const next = marker ? `${marker.x}|${marker.y}|${marker.angle}|${marker.opacity}` : 'aus';
  if (element.dataset.state === next) return;
  element.dataset.state = next;
  element.dataset.visible = String(Boolean(marker));
  if (!marker) {
    element.style.opacity = '0';
    return;
  }
  element.style.left = `${marker.x * 100}%`;
  element.style.top = `${marker.y * 100}%`;
  element.style.opacity = String(marker.opacity);
  element.style.setProperty('--marker-angle', `${marker.angle}rad`);
}

export function EdgeMarkers({ scene }: { readonly scene: BoardScene | null }) {
  const elements = useRef(new Map<SlotNumber, HTMLDivElement>());

  useEffect(() => {
    if (!scene) return undefined;
    const map = elements.current;
    const stop = scene.onEdgeMarkers((markers) => {
      for (const slot of SLOTS) {
        const element = map.get(slot);
        if (element)
          apply(
            element,
            markers.find((m) => m.slot === slot),
          );
      }
    });
    return () => {
      stop();
      for (const element of map.values()) apply(element, undefined);
    };
  }, [scene]);

  return (
    <div className="edge-markers" aria-hidden="true">
      {SLOTS.map((slot) => (
        <div
          key={slot}
          className="edge-marker"
          data-testid={`edge-marker-${slot}`}
          data-visible="false"
          style={{ '--player-color': PLAYER_SLOTS[slot].color, opacity: 0 } as CSSProperties}
          ref={(element) => {
            if (element) elements.current.set(slot, element);
            else elements.current.delete(slot);
          }}
        >
          <svg className="edge-marker-pointer" viewBox="0 0 100 100">
            <path d={MARKER_PATH} />
          </svg>
          <span className="edge-marker-symbol">{PLAYER_SLOTS[slot].symbol}</span>
        </div>
      ))}
    </div>
  );
}
