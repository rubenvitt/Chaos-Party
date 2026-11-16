# Renderer-Spike mit Bevy (CHAOS-75)

Wegwerf-Prototyp, **nicht** Teil des Spiels und nicht im pnpm-Workspace. Er zeigt dieselbe Testszene wie das Spielbrett, um Babylon.js (WebGL2/WebGPU) mit Bevy als WebAssembly und nativ auf echter Hardware zu vergleichen.

- Anleitung und Messbogen: [`docs/renderer-spike.md`](../../docs/renderer-spike.md)
- Entscheidungsentwurf: [`docs/decisions/ADR-016-renderer.md`](../../docs/decisions/ADR-016-renderer.md)
- Experiment: [`docs/experiments.md`](../../docs/experiments.md) EXP-015

Kurz:

```bash
node scripts/spike-export-board.mjs          # im Repo-Wurzelverzeichnis: Szene exportieren
cd spikes/renderer-bevy && cargo run --release -- --sekunden=30
./build-web.sh && python3 -m http.server 8090 -d web
```

`assets/export/`, `target/`, `web/pkg-*` und `web/assets/` sind erzeugt und nicht eingecheckt. Lizenz der Abhängigkeiten: Bevy und seine Crates MIT/Apache-2.0; Szene und Figuren stammen aus dem Repo (CC0-Texturen, eigene Modelle).
