/**
 * Build-Artefakte aus dem Manifest (CHAOS-140): Prüfregeln und die Herkunftsdatei
 * `herkunft.json`, die der Build-Schritt neben die Artefakte legt. Die native App liefert sie
 * mit aus; so bleibt für jede Datei nachvollziehbar, aus welchen Assets sie besteht und welche
 * Lizenzen und Namensnennungen gelten.
 */
import { ATTRIBUTION_REQUIRED, type AssetManifest } from './manifest.ts';

export interface ProvenanceInput {
  readonly id: string;
  readonly source: string;
  readonly license: string;
  readonly attribution?: string;
  readonly origin?: string;
}

export interface ProvenanceArtifact {
  readonly id: string;
  readonly path: string;
  readonly description: string;
  readonly license: string;
  readonly inputs: readonly ProvenanceInput[];
}

export interface Provenance {
  readonly $comment: string;
  readonly build: string;
  readonly generator: string;
  readonly artifacts: readonly ProvenanceArtifact[];
  /** Alle Lizenzen, die für die Artefakte gelten (sortiert). */
  readonly licenses: readonly string[];
  /** Namensnennungen, die die Lizenzen verlangen (ohne Dopplungen). */
  readonly attributions: readonly string[];
}

/** Regelverstöße der Build-Einträge (ohne Dateiprüfung). */
export function checkBuildEntries(manifest: AssetManifest): string[] {
  const errors: string[] = [];
  const assets = new Map(manifest.assets.map((a) => [a.id, a]));
  const ids = new Set(assets.keys());
  for (const [name, build] of Object.entries(manifest.builds ?? {})) {
    for (const artifact of build.artifacts) {
      const label = `Build „${name}“, Artefakt „${artifact.id}“`;
      if (ids.has(artifact.id)) errors.push(`${label}: id doppelt`);
      ids.add(artifact.id);
      const inputs = artifact.from.map((id) => assets.get(id));
      artifact.from.forEach((id, i) => {
        if (!inputs[i]) errors.push(`${label}: „from“ nennt unbekanntes Asset „${id}“`);
      });
      // GPL-Eigenwerk lässt sich nicht freizügiger weitergeben (ADR-018).
      if (
        artifact.license !== 'GPL-3.0-only' &&
        inputs.some((input) => input?.license === 'GPL-3.0-only')
      ) {
        errors.push(`${label}: enthält GPL-Assets, Lizenz muss GPL-3.0-only sein`);
      }
    }
  }
  return errors;
}

/** Inhalt von `herkunft.json` für einen Build-Schritt. */
export function provenance(manifest: AssetManifest, buildName: string): Provenance {
  const build = manifest.builds?.[buildName];
  if (!build) throw new Error(`Build „${buildName}“ steht nicht im Manifest`);
  const assets = new Map(manifest.assets.map((a) => [a.id, a]));
  const artifacts = build.artifacts.map((artifact) => ({
    id: artifact.id,
    path: artifact.path,
    description: artifact.description,
    license: artifact.license,
    inputs: artifact.from.map((id) => {
      const asset = assets.get(id);
      if (!asset) throw new Error(`Artefakt „${artifact.id}“: Asset „${id}“ fehlt im Manifest`);
      return {
        id,
        source: asset.source,
        license: asset.license,
        ...(asset.attribution ? { attribution: asset.attribution } : {}),
        ...(asset.origin ? { origin: asset.origin } : {}),
      };
    }),
  }));
  const licenses = new Set<string>();
  const attributions = new Set<string>();
  for (const artifact of artifacts) {
    licenses.add(artifact.license);
    for (const input of artifact.inputs) {
      licenses.add(input.license);
      if (ATTRIBUTION_REQUIRED.has(input.license) && input.attribution) {
        attributions.add(input.attribution);
      }
    }
  }
  return {
    $comment: `Herkunft und Lizenzen der Artefakte von ${build.generator} (aus packages/assets/manifest.json, CHAOS-140).`,
    build: buildName,
    generator: build.generator,
    artifacts,
    licenses: [...licenses].sort(),
    attributions: [...attributions].sort(),
  };
}
