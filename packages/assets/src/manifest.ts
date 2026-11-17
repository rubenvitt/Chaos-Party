/**
 * Asset-Manifest (CHAOS-28, ARCHITECTURE „Hybrid asset pipeline“): maschinenlesbare Herkunft,
 * Lizenz, Attribution und Budget je Asset – Dateien (GLB, SVG, später Sounds) **und**
 * prozedurale Dinge aus Code (Brett, Arena, Effekte). Geprüft von `pnpm check:assets`.
 *
 * Pfade sind relativ zum Repository-Wurzelordner und benutzen `/`.
 */
import { z } from 'zod';

export const ASSET_KINDS = [
  'model',
  'sound',
  'vfx',
  'texture',
  /** Umgebungslicht und Himmel als Radiance-HDR (CHAOS-62). */
  'hdri',
  'font',
  'procedural-geometry',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** `generated`: aus eigenem Skript erzeugte Datei; `procedural`: zur Laufzeit aus Code;
 *  `imported`: fremde Datei oder Paket (Lizenz besonders prüfen). */
export const ASSET_SOURCES = ['generated', 'procedural', 'imported'] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

/** Lizenzen, die Assets haben dürfen (SPDX). Neue nur nach Prüfung ergänzen. */
export const ALLOWED_ASSET_LICENSES = [
  // Eigenwerk: Chaos Party steht samt eigenen Assets unter GPL-3.0-only (ADR-018, CHAOS-69).
  'GPL-3.0-only',
  'CC0-1.0',
  'CC-BY-4.0',
  'OFL-1.1',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
] as const;

/** Lizenzen, die eine Namensnennung verlangen (Feld `attribution` Pflicht). */
export const ATTRIBUTION_REQUIRED: ReadonlySet<string> = new Set([
  'CC-BY-4.0',
  'OFL-1.1',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
]);

/** Ordner unter `packages/assets`, deren Dateien alle im Manifest stehen müssen. */
export const ASSET_FILE_DIRS = ['models', 'sounds', 'textures'] as const;

const relativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'), {
    message: 'Pfad muss relativ zum Repository sein (ohne „..“, mit „/“)',
  });

export const AssetEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/, 'id: Kleinbuchstaben, Ziffern, Bindestrich'),
    kind: z.enum(ASSET_KINDS),
    source: z.enum(ASSET_SOURCES),
    /** Datei (generiert/importiert) oder Code-Datei (prozedural, Einbindung eines Pakets). */
    path: relativePath,
    description: z.string().min(3),
    /** Erzeugendes Skript (Pflicht bei `generated`). */
    generator: relativePath.optional(),
    /** npm-Paket, aus dem das Asset stammt (Lizenz wird gegen `package.json` geprüft). */
    package: z.string().min(1).optional(),
    /** SPDX-Kennung (oder `LicenseRef-…`). */
    license: z.string().min(1),
    attribution: z.string().min(3).optional(),
    /** Herkunft einer importierten Datei (Pflicht bei `imported` ohne `package`), z. B. die
     *  Poly-Haven-Seite des Assets: Lizenznachweis. */
    origin: z.url({ protocol: /^https$/ }).optional(),
    /** Höchstgröße der Datei in Bytes (Pflicht für Dateien unter `packages/assets`). */
    budgetBytes: z.number().int().positive().optional(),
    /** Nur Modelle: erwartete Animationsnamen und Höhe in Metern (Ruhepose). */
    animations: z.array(z.string().min(1)).min(1).optional(),
    height: z.number().positive().optional(),
  })
  .strict();
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

/**
 * Build-Artefakt (CHAOS-140): eine Datei, die ein Build-Schritt aus Manifest-Assets erzeugt und
 * die nicht eingecheckt ist (z. B. USDZ für den nativen Apple-Host). `from` nennt die Assets,
 * deren Inhalt eingeht; ihre Lizenzen und Attributionen gelten mit und landen in der
 * `herkunft.json` neben dem Artefakt.
 */
export const BuildEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/, 'id: Kleinbuchstaben, Ziffern, Bindestrich'),
    /** Ziel relativ zum Ausgabeordner des Build-Schritts (z. B. `figuren/robot.usdz`). */
    path: relativePath,
    description: z.string().min(3),
    /** Lizenz des Artefakts (SPDX). */
    license: z.string().min(1),
    /** Manifest-Assets, die eingehen (IDs aus `assets`). */
    from: z.array(z.string().min(1)).min(1),
    budgetBytes: z.number().int().positive(),
  })
  .strict();
export type BuildEntry = z.infer<typeof BuildEntrySchema>;

export const ModelBudgetSchema = z
  .object({
    maxBytes: z.number().int().positive(),
    maxMeshes: z.number().int().positive(),
    maxPrimitives: z.number().int().positive(),
    maxMaterials: z.number().int().positive(),
    maxTriangles: z.number().int().positive(),
  })
  .strict();

export const ManifestSchema = z
  .object({
    $comment: z.string().optional(),
    version: z.literal(1),
    budgets: z
      .object({
        model: ModelBudgetSchema,
        texture: z.object({ maxBytes: z.number().int().positive() }).strict(),
        hdri: z.object({ maxBytes: z.number().int().positive() }).strict(),
        sound: z.object({ maxBytes: z.number().int().positive() }).strict(),
      })
      .strict(),
    assets: z.array(AssetEntrySchema),
    /** Erzeugte, nicht eingecheckte Artefakte je Build-Schritt (CHAOS-140). */
    builds: z
      .record(
        z.string().regex(/^[a-z0-9-]+$/),
        z
          .object({
            /** Standard-Ausgabeordner relativ zum Repository. */
            out: relativePath,
            generator: relativePath,
            artifacts: z.array(BuildEntrySchema).min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type AssetManifest = z.infer<typeof ManifestSchema>;
