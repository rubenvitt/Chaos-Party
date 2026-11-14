# Chaos Party

Chaotisches 3D-Party-Brettspiel für 2–4 Personen im selben Raum. Das Spiel läuft auf dem PC; iPhones bzw. ein geteiltes iPad dienen per Browser als Controller.

## Projektdokumente (Quelle der Wahrheit)

- [`VISION.md`](VISION.md) – Produktvision, Säulen, Umfang des Vertical Slice
- [`ARCHITECTURE.md`](ARCHITECTURE.md) – Zielarchitektur, Stack, Protokoll, Tests
- [`ROADMAP.md`](ROADMAP.md) – Meilensteine M1–M4 mit Abnahme-Gates
- [`CLAUDE.md`](CLAUDE.md) – Arbeitsanweisungen für Claude Code

Aufgaben werden in Zunder im Projekt **Chaos Party** (Kennung `CHAOS-…`) geführt.

## Arbeitsweise mit Claude Code

Claude Code arbeitet die Zunder-Aufgaben Meilenstein für Meilenstein ab; jeder Meilenstein endet mit einer menschlichen Abnahme. Regeln stehen in `CLAUDE.md` („Task management with Zunder“), die Abläufe als Projekt-Skills in `.claude/skills/`:

| Skill | Zweck |
|---|---|
| `aufgabe-umsetzen` | `CHAOS-…`-Aufgabe oder die nächste freie Aufgabe umsetzen |
| `meilenstein-abnahme` | Abnahme vorbereiten, Entscheidung eintragen |
| `experiment-protokollieren` | Varianten-Vergleiche nach Experiment-Protokoll festhalten |
| `blocker-eskalieren` | Nach drei Fehlversuchen oder bei Freigabebedarf sauber eskalieren |
