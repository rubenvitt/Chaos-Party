# Sicherheits- und Lizenzprüfung (Release Candidate M4)

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-42 · **Geprüfter Stand:** Branch mit Commit `85f9fbc` (Basis `f5307ef`, Performance-Pass M4) · **Umgebung:** Linux x64, Node 22.23.4, pnpm 10.28.0

Kurz: **Keine Secrets im Repository, keine bekannten Schwachstellen in Laufzeit-Abhängigkeiten, alle Lizenzen auf der Positivliste.** Ein Befund wurde behoben: Die Controller-Schrift Inter fehlte im Asset-Manifest. Offen bleiben eine mittlere Schwachstelle in einem Entwicklungswerkzeug (`minimatch` über ESLint, nicht im Spiel) und Hinweise für den Fall, dass jemand einen fertigen Build weitergibt.

## 1. Befehle und Ergebnisse

| Befehl | Ergebnis | Bewertung |
|---|---|---|
| `pnpm install --frozen-lockfile` | ok, 195 Pakete aus dem Lockfile (frischer Klon, leerer Store) | Lockfile ist vollständig und unverändert |
| `pnpm check:licenses` | „Lizenzen ok: 13 Laufzeit-Pakete, alle auf der Positivliste“ (seit CHAOS-69 zusätzlich: „Lizenzhinweise ok: 3 Builds …“) | ok, Liste unten |
| `pnpm check:assets` | „Assets ok: 23 Manifest-Einträge geprüft“ (vorher 22, siehe Befund B1) | ok |
| `pnpm audit --prod` | „No known vulnerabilities found“ | ok |
| `pnpm audit` (inkl. Entwicklung) | 1 × moderate: `minimatch` 10.2.6 über `eslint` ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)) | nur Entwicklungswerkzeug, siehe O1 |
| Secret-Suche über alle 591 versionierten Dateien (`git ls-files`, Muster siehe Abschnitt 3) | keine Treffer | ok |
| Laufzeit-Netzwerkprüfung (Playwright/Chromium, Host und Controller, Abschnitt 4) | keine Anfrage an fremde Hosts, keine Seitenfehler | ok, siehe O2 |

Die Audit-Abfrage braucht Netz zur npm-Registry; sie lief in dieser Umgebung über den Proxy.

## 2. Abhängigkeiten

### Laufzeit-Pakete (`pnpm -r licenses list --prod`)

| Lizenz | Pakete |
|---|---|
| Apache-2.0 | `@babylonjs/core` 9.35.0, `@babylonjs/loaders` 9.35.0, `babylonjs-gltf2interface` 9.35.0 |
| MIT | `@babylonjs/havok` 1.3.14, `@types/emscripten` 1.41.6, `react` 19.3.1, `react-dom` 19.3.1, `scheduler` 0.28.0, `uqr` 0.1.3, `ws` 8.22.1, `zod` 4.6.7 |
| OFL-1.1 | `@fontsource-variable/nunito` 5.3.0 (Host), `@fontsource-variable/inter` 5.3.0 (Controller) |

Alle stehen auf der Positivliste in `scripts/check-licenses.mjs` (MIT, ISC, BSD, Apache-2.0, 0BSD, BlueOak, CC0, OFL-1.1). Keine Copyleft-Lizenz (GPL/LGPL/AGPL) im Spiel.

### Renderer-Spike (CHAOS-75, nicht im Spiel)

- `@babylonjs/serializers` 9.35.0 (Apache-2.0) als **Dev-Abhängigkeit** des Hosts, nur für die Export-Seite `apps/host/src/export/` (nicht im Build; seit CHAOS-140 Teil von `pnpm build:apple-assets`).
- `spikes/renderer-bevy`: Rust-Crate außerhalb des pnpm-Workspace mit Bevy 0.20.1 (MIT/Apache-2.0), `serde`/`serde_json` (MIT/Apache-2.0), `web-sys` (MIT/Apache-2.0); fest auf `Cargo.lock`. Wird nicht ausgeliefert; Build-Ausgaben und die exportierte Szene sind nicht eingecheckt.

### USDZ-Build-Schritt (CHAOS-140, nur Werkzeuge)

`pnpm build:apple-assets` nutzt in `.venv-blender` zwei Python-Pakete, fest gepinnt in `packages/assets/blender/requirements.txt`. Beide sind Werkzeuge und werden nicht ausgeliefert:

- `bpy` 5.3.0 (Blender als Python-Modul, GPL-2.0-or-later), wie schon für die Figuren (CHAOS-58). Was Blender erzeugt, gehört nicht unter Blenders Lizenz.
- `usd-core` 26.11 (Pixar USD, Tomorrow Open Source Technology License 1.0, Apache-2.0-artig), nur zum Prüfen der USDZ.

Die erzeugten USDZ stehen mit Herkunft und Lizenz im Manifest unter `builds` und in `herkunft.json` neben den Dateien (GPL-3.0-only; darin CC0-Texturen von Poly Haven und mit Nunito gezeichnete Wegweiser, OFL-1.1). Siehe [`apple-assets.md`](apple-assets.md).

### Sparkle in der Mac-App (CHAOS-156)

Die Mac-App des nativen Hosts (`apps/apple-host`, nur macOS, nicht tvOS) bindet **Sparkle 2.10.1** als Swift Package ein (automatische Updates). Geprüft am 18.11.2026:

- **Lizenz:** MIT (Sparkle selbst), dazu im selben `LICENSE` bsdiff (BSD-2-Clause-artig), sais-lite (MIT) und ed25519 (zlib). Alle frei kombinierbar mit GPL-3.0. Der Text liegt als `apps/apple-host/licenses/Sparkle-LICENSE.txt` im Repo und in der App unter `Contents/Resources/Sparkle-LICENSE.txt`.
- **Version und Herkunft:** `exactVersion: 2.10.1` in `project.yml` (Tag vom 25.10.2026, also älter als die 7-Tage-Sperre); das Binär-Paket prüft Xcode gegen die SHA-256 im `Package.swift` des Tags. Das Werkzeug `sign_update` lädt der Workflow aus dem Release-Archiv `Sparkle-2.10.1.tar.xz` mit fester SHA-256 (`scripts/sparkle-feed.sh`).
- **Angriffsfläche:** Die App lädt einmal täglich `appcast.xml` von einer festen GitHub-Release-Adresse über HTTPS. Feed (`SURequireSignedFeed`) und Zip sind mit einem EdDSA-Schlüssel signiert; die App prüft beides gegen `SUPublicEDKey`, die Zip-Signatur schon vor dem Entpacken (`SUVerifyUpdateBeforeExtraction`). Zusätzlich muss das Update dieselbe Developer-ID-Signatur tragen. Ohne öffentlichen Schlüssel (lokale Builds, PR-CI) startet der Updater gar nicht.
- **Schlüssel:** Der private Schlüssel liegt nur als Actions-Secret `SPARKLE_ED_PRIVATE_KEY` und im Schlüsselbund von Rubens Mac, nie im Repository. Er geht im Workflow nur per stdin an `sign_update`. Die CI nutzt bei jedem PR ein Wegwerf-Schlüsselpaar.

### Release-Werkzeuge (CHAOS-156, nur Entwicklung/CI)

`semantic-release` 25.0.9 (MIT) und `@commitlint/cli` + `@commitlint/config-conventional` 21.2.4 (MIT) als Dev-Abhängigkeiten im Wurzel-`package.json`, über das Lockfile und die 7-Tage-Sperre (semantic-release 26 war zu neu). Sie laufen nur in der CI: semantic-release im Probelauf ohne Schreibrechte-Bedarf (legt keinen Tag an, veröffentlicht nicht; das macht der Workflow selbst), commitlint gegen die Commits eines PRs. Nichts davon landet in einem Build.

### Lieferkette

- `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (neue Paketversionen erst nach 7 Tagen), Install-Skripte nur für `esbuild` (`onlyBuiltDependencies`).
- CI und `pnpm play` installieren mit `--frozen-lockfile`: Es kommt nur, was im Lockfile steht.
- Der Server hat zwei npm-Laufzeit-Abhängigkeiten (`ws`, `uqr`), gebündelt mit esbuild; die optionalen nativen Beschleuniger von `ws` werden nicht installiert.

## 3. Secrets und Dateien im Repository

Geprüft mit `git ls-files` (591 Dateien):

- **Dateinamen:** keine `.env*`, `.pem`, `.key`, `.p12`, `.pfx`, `.crt`, `.keystore`, `id_rsa`/`id_ed25519`, `.npmrc` oder Dateien mit „secret“/„credential“ im Namen. `.gitignore` schließt `.env` und `.env.*` aus.
- **Inhalte:** keine privaten Schlüssel (`-----BEGIN … PRIVATE KEY-----`), keine Token-Formate (AWS `AKIA…`, GitHub `ghp_`/`gho_`/`github_pat_`, Slack `xox…`, Anthropic/OpenAI `sk-…`, Google `AIza…`, GitLab `glpat-`, npm `npm_…`), keine Zuweisungen der Form `password|secret|api_key|token = "…"`, keine URLs mit Zugangsdaten (`https://user:pass@…`).
- **Binärdateien:** 109 PNG/JPG (eigene Screenshots unter `docs/screenshots/` und Screenshot-Baselines unter `tests/e2e/__screenshots__/`, größte 1,0 MB) und 4 GLB-Figuren unter `packages/assets/models/` (alle im Manifest, 110–323 KiB). Keine Archive, Programme, Schriften oder WASM-Dateien im Repo; Schriften und Havok-WASM kommen aus npm-Paketen.
- Der Server erzeugt Join-Code und Sitzungs-Tokens zur Laufzeit (`node:crypto`), nichts davon wird gespeichert.

## 4. Laufzeit: Netz und Angriffsfläche

**Keine Netzwerkdienste außer dem lokalen Server.** Ein Playwright-Lauf gegen den Production-Server (`pnpm play`, Port 8840) hat geöffnet: Host-Lobby (`/host/`), Arena, Brett-Demo mit 4 Spielern, alle vier Minispiele (Sockenregen, Pudding-Gerangel, Wackelturm, Pump-Parade), Controller als iPhone und als iPad mit 2 Zonen, je 9 s. Ergebnis: **0 Anfragen an andere Hosts als den Server**, 0 Seitenfehler. Das Bundle enthält zwar Babylon-Adressen (`cdn.babylonjs.com` für KTX2, `assets.babylonjs.com` für OpenPBR-Rauschtextur, `unpkg.com/fflate` für EXR, `snippet.babylonjs.com`), aber für Funktionen, die das Spiel nicht nutzt. Ohne Internet läuft das Spiel vollständig.

**Server** (`apps/server`), Vertrauensmodell „Spielrunde im eigenen WLAN“:

- Bindet standardmäßig auf `0.0.0.0:8787`, also für alle Geräte im selben Netz erreichbar. Nur `GET`/`HEAD`; statische Dateien mit Schutz gegen Pfad-Ausbruch (`403`).
- WebSocket: höchstens 64 Verbindungen, 16 KiB je Nachricht, zod-Validierung jeder Nachricht, Ratenbegrenzung je Slot, Missbrauch → Verbindung wird geschlossen (ADR-005).
- Der Join-Code (4 Zeichen) und die Sitzungs-Tokens schützen vor Verwechslung, nicht vor Angreifern im selben WLAN. Wer im Netz ist, kann `/host/` öffnen, sobald kein Host verbunden ist. Für eine Party im Heimnetz ist das gewollt. **Empfehlung: nicht in offenen/öffentlichen Netzen spielen**, sondern im Heim-WLAN oder im eigenen Hotspot, wie es [network-setup.md](network-setup.md#gäste-wlan-und-client-isolation) ohnehin rät.
- Keine Anmeldung, keine Speicherung personenbezogener Daten, keine Telemetrie.

## 5. Assets und Lizenzen

Quelle: `packages/assets/manifest.json`, geprüft von `pnpm check:assets` (Datei vorhanden, Budget, Lizenz gegen `package.json` des npm-Pakets, Figuren-Vertrag).

| Gruppe | Einträge | Herkunft | Lizenz |
|---|---|---|---|
| Figuren (GLB) | 4 (Schraubi, Kalle Kaktus, Wusel, Socke Sigi) | eigene Blender-Skripte (`packages/assets/blender`, CHAOS-58) | `LicenseRef-ChaosParty-Eigenwerk` |
| Porträts (SVG) | 4 | eigener Generator | Eigenwerk |
| Minispiel-Requisiten (GLB) | 27 in 10 Sets (CHAOS-88) | eigene Blender-Skripte (`packages/assets/blender/requisiten.py`) | `GPL-3.0-only` (Eigenwerk, keine Fremdquellen) |
| Prozedurale Geometrie | 10 (Brett, Marker, Fallen, Sockel, Abzeichen, Arena, 4 Minispiele) | Code | Eigenwerk |
| Klänge, Partikel | 3 | prozedural im Code (WebAudio, Babylon-Partikel) | Eigenwerk |
| Schriften | 2: Nunito (Host), Inter (Controller) | npm `@fontsource-variable/*` | OFL-1.1 |

Keine fremden Bilder, Texturen, Modelle oder Klänge im Spiel. Die Look-Dev-Assets von Poly Haven (CC0, `scripts/fetch-lookdev-assets.mjs`, CHAOS-56/57) sind nicht eingecheckt und für das Spiel nicht nötig; siehe O3.

## 6. Befunde

| Nr. | Befund | Schwere | Status |
|---|---|---|---|
| B1 | Controller-Schrift **Inter** (`@fontsource-variable/inter`, OFL-1.1, seit CHAOS-59) wird ausgeliefert, stand aber nicht im Asset-Manifest; der Nunito-Eintrag nannte noch „Controller“. Lizenzrechtlich unkritisch (Lizenz-Check grün), aber Attribution unvollständig. | gering | **behoben**: Eintrag `schrift-inter` ergänzt, Nunito-Beschreibung korrigiert |

## 7. Offene Punkte

| Nr. | Punkt | Bewertung / Vorschlag |
|---|---|---|
| O1 | `minimatch` 10.2.6 (moderate, Denial of Service über Glob-Muster) über `eslint` und `typescript-eslint` | Nur Entwicklungsrechner/CI beim Lint; verarbeitet nur eigene Konfigurationsmuster. Behoben ab `minimatch` 11.0.1; ein Override wäre ein Major-Sprung unter ESLint. Abwarten, bis ESLint/typescript-eslint aktualisieren, dann `pnpm update`. |
| O2 | Kein automatischer Wächter gegen Anfragen an fremde Hosts | Heute 0 Anfragen (Abschnitt 4). Vorschlag: In die E2E-Fixture ein `page.route` einbauen, das fremde Hosts blockiert und den Test scheitern lässt. |
| O3 | Look-Dev-Assets landen im Build, falls ein Entwickler sie lokal geladen hat (`apps/host/public/lookdev-assets/`, Vite kopiert `public/`) | CC0, also lizenzrechtlich frei; nur unnötige Größe. Auf einem frischen PC nicht vorhanden. Vor einer Weitergabe von Builds Ordner löschen oder aus `public/` herausnehmen. |
| O4 | **Erledigt (CHAOS-69, ADR-018):** `pnpm build` schreibt `LICENSE.txt` und `THIRD-PARTY-NOTICES.txt` in jedes `dist/`, `pnpm check:licenses` prüft sie. Ursprünglich: Weitergabe eines fertigen Builds (`dist/`) | Heute wird nur der Quellcode geklont und lokal gebaut; die Lizenztexte liegen dann in `node_modules`. Wer `dist/` weitergibt, muss Lizenzhinweise beilegen (Apache-2.0 für Babylon, OFL-1.1 für die Schriften: Copyright und Lizenztext). Dann `THIRD-PARTY-NOTICES` erzeugen. Weitergabe/Veröffentlichung braucht ohnehin Rubens Freigabe (CLAUDE.md). |
| O5 | **Erledigt (CHAOS-69, ADR-018):** Ruben hat am 17.11.2026 GPL-3.0 gewählt; Code und eigene Assets stehen unter `GPL-3.0-only`, `LICENSE` liegt im Wurzelverzeichnis. Ursprünglich: Lizenz des eigenen Codes und der Eigenwerk-Assets (`LicenseRef-ChaosParty-Eigenwerk`) | Im Repo steht keine `LICENSE`-Datei. Für ein privates Projekt unkritisch; vor einer Veröffentlichung entscheidet Ruben die Lizenz. |
