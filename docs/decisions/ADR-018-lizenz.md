# ADR-018: Projektlizenz GPL-3.0-only für Code und eigene Assets, Lizenzhinweise im Build

**Status:** Angenommen (Rubens Entscheidung, 2026-11-17)
**Datum:** 2026-11-17
**Aufgabe:** CHAOS-69 (aus der Sicherheits- und Lizenzprüfung CHAOS-42, Punkte O4/O5)
**Betroffene Annahmen:** –

## Kontext

Die Lizenzprüfung (CHAOS-42, [`security-license-review.md`](../security-license-review.md)) fand keine `LICENSE`-Datei. Eigene Assets trugen die Platzhalter-Kennung `LicenseRef-ChaosParty-Eigenwerk`. Wer einen fertigen Build (`apps/*/dist`) weitergibt, musste die Lizenzen der gebündelten Pakete von Hand beilegen (Apache-2.0 samt NOTICE für Babylon.js, MIT, OFL-1.1 für die Schriften).

Ruben hat am 17.11.2026 entschieden: **Chaos Party wird Open Source.** Auf Nachfrage wählte er:

- Code: **GPL-3.0**
- Eigene Assets: **dieselbe Lizenz wie der Code**
- Builds sollen weitergegeben werden können: **Lizenzhinweise im Build erzeugen**

Laufzeit-Abhängigkeiten heute: Apache-2.0 (Babylon.js), MIT (Havok, React, ws, zod, uqr), OFL-1.1 (Nunito, Inter). Apache-2.0 und MIT sind mit GPL-3.0 verträglich. Die Schriften bleiben eigenständige Werke unter OFL-1.1, die nur mitgeliefert werden. Das ist erlaubt, die GPL gilt nicht für sie.

## Entscheidung

1. **Lizenz `GPL-3.0-only`** für den ganzen Quellcode im Repository und für alle eigenen Assets. `LICENSE` im Wurzelverzeichnis enthält den unveränderten GPL-3.0-Text (SHA-256 `3972dc97…6986`, identisch mit gnu.org/licenses/gpl-3.0.txt).
   - Alle `package.json` (Wurzel, `apps/*`, `packages/*`) haben `"license": "GPL-3.0-only"`, ebenso `spikes/renderer-bevy/Cargo.toml`.
   - Das Asset-Manifest nennt `GPL-3.0-only` statt `LicenseRef-ChaosParty-Eigenwerk`; die Positivliste in `packages/assets/src/manifest.ts` erlaubt die Kennung für Eigenwerk. Die „bevorzugte Form zum Bearbeiten“ der Figuren und Porträts liegt im Repository (Blender-Skripte in `packages/assets/blender/`).
   - **„only“ statt „or-later“**: Ruben hat „GPL-3.0“ gewählt. „Only“ hält die Wahl bei genau dieser Version; ein späterer Wechsel auf „or-later“ ist jederzeit möglich, solange nur Ruben Urheber ist. Rückweg wäre schwierig.
2. **Lizenzhinweise im Build.** `scripts/third-party-notices.mjs` (`pnpm notices`, läuft am Ende von `pnpm build`) schreibt in jedes `apps/*/dist`:
   - `LICENSE.txt`: Kopie von `LICENSE`
   - `THIRD-PARTY-NOTICES.txt`: Projektlizenz, Link zum Quellcode, Liste aller Laufzeit-Pakete der App und ihrer Workspace-Pakete (`pnpm --filter <app>... licenses list --prod`), je Paket Lizenz-, Autor-, Homepage-Angabe und der volle Text der Lizenz- und NOTICE-Dateien aus dem Paket.
   Die Liste nennt eher zu viel als zu wenig, etwa Babylon.js im Server-Build, wo es beim Bündeln wegfällt. Fehlt einem Paket die Lizenzdatei, bricht der Generator ab.
3. **`pnpm check:licenses` prüft die Hinweise mit:** Jeder vorhandene Build muss beide Dateien mit genau dem Soll-Inhalt haben. Sonst Fehler mit Hinweis auf `pnpm notices`. Ohne Build meldet die Prüfung „nicht geprüft“; in CI und `pnpm check` läuft `pnpm build` vorher.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| MIT oder Apache-2.0 | Rubens Wahl ist Copyleft: Weitergegebene Änderungen sollen offen bleiben. |
| AGPL-3.0 | Das Spiel läuft lokal im eigenen WLAN, nicht als öffentlicher Dienst; die Netz-Klausel brächte kaum etwas. Ruben hat GPL-3.0 gewählt. |
| Getrennte Asset-Lizenz (CC BY 4.0) | Ruben wollte eine Lizenz fürs ganze Repo; die Assets entstehen ohnehin aus Code. |
| Lizenzhinweise per Vite-Plugin je App | Drei Stellen statt einer, und der Server baut mit esbuild. Ein Skript nach `pnpm -r build` deckt alle drei Builds gleich ab. |
| Nur Lizenz-Kommentare im Bundle (`legalComments`) | Erfasst keine NOTICE-Dateien und keine Schriften; Babylon.js hat keine Lizenz-Kommentare je Datei. |

## Konsequenzen

**Positiv**
- Das Repository ist bereit zur Veröffentlichung; jeder Build lässt sich mit allen Lizenzpflichten weitergeben.
- Lizenzhinweise veralten nicht still: neue oder aktualisierte Pakete fallen in `check:licenses` auf.

**Negativ / Risiken**
- **Quellcode-Pflicht der GPL:** Wer einen Build weitergibt, muss den passenden Quellcode anbieten. Die Hinweise verweisen auf `https://github.com/rubenvitt/chaos-party`. Das reicht nur, solange das Repository öffentlich ist und den weitergegebenen Stand enthält (Tag oder Commit). **Das Repository öffentlich zu stellen bleibt Rubens Schritt.**
- Beiträge Dritter fallen unter GPL-3.0-only. Ein späterer Lizenzwechsel bräuchte dann deren Zustimmung (oder eine Beitragsvereinbarung).
- **App Store und TestFlight:** Die native Controller-App (`apps/controller-ios`, CHAOS-115, ADR-017) soll über TestFlight verteilt werden. Die Nutzungsbedingungen des App Store legen Nutzern Einschränkungen auf, die die GPL verbietet. Das stört nicht, solange **nur Ruben** Urheber des Codes in der App ist: Als Rechteinhaber ist er an seine eigene Lizenz nicht gebunden und darf die App zusätzlich unter anderen Bedingungen verteilen. Kommt fremder GPL-Code in die App, etwa angenommene Beiträge, braucht es vorher eine Beitragsvereinbarung oder eine App-Store-Ausnahme in der Lizenz. Die App nutzt heute nur Apple-Frameworks und eigenen Code, keine fremden Swift-Pakete.
- Die Quelldateien tragen keinen Lizenzkopf je Datei; `LICENSE`, die `package.json`-Felder und das README gelten fürs ganze Repository.

## Überprüfung

Neu bewerten, wenn eine Abhängigkeit mit GPL-unverträglicher Lizenz dazukommen soll (die Positivliste in `scripts/check-licenses.mjs` verhindert das bis zur Prüfung), wenn Fremdbeiträge in Apps einfließen sollen, die über App Store/TestFlight verteilt werden (Controller-App CHAOS-115, tvOS CHAOS-74) oder wenn Fremdbeiträge angenommen werden sollen.
