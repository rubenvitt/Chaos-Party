/**
 * Cel-Shading als Material-Plugin für `StandardMaterial` (CHAOS-56, Look-Dev, Richtung „Toon“).
 * Nach der Lichtschleife wird die Helligkeit des diffusen Lichts in drei weiche Stufen
 * quantisiert (Farbton bleibt), Glanzlichter werden zu harten Flecken, dazu ein Randlicht.
 * Schatten der `ShadowGenerator` laufen weiter durch die Standard-Lichtberechnung.
 */
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';

export class ToonPlugin extends MaterialPluginBase {
  constructor(material: StandardMaterial) {
    super(material, 'Toon', 200, { TOON: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines.TOON = true;
  }

  override getClassName(): string {
    return 'ToonPlugin';
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
vec3 toonRamp(vec3 light) {
  float lum = max(max(light.r, light.g), light.b);
  vec3 hue = lum > 0.0001 ? light / lum : vec3(1.0);
  float q = 0.46 + smoothstep(0.26, 0.31, lum) * 0.36 + smoothstep(0.78, 0.82, lum) * 0.22;
  return hue * q;
}`,
      '!aggShadow=aggShadow\\/numLights;': `aggShadow=aggShadow/numLights;
diffuseBase = toonRamp(diffuseBase);
#ifdef SPECULARTERM
specularBase = vec3(smoothstep(0.42, 0.48, max(max(specularBase.r, specularBase.g), specularBase.b))) * 0.55;
#endif
{
  float rim = 1.0 - max(dot(viewDirectionW, normalW), 0.0);
  diffuseBase += vec3(smoothstep(0.62, 0.68, rim) * 0.22);
}`,
    };
  }
}
