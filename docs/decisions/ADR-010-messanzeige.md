# ADR-010: Messanzeige mit `?debug=1` – Rundlaufzeit, Bildrate, Eingabe→Frame als M1-Baseline

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-45
**Betroffene Annahmen:** `docs/assumptions.md` B8 (Client-Uhren nicht vertrauenswürdig)

## Kontext

`ARCHITECTURE.md` („Testing strategy“, Punkt 4) verlangt eine einfache Messung von Bildrate und Controller-Eingabelatenz, mit Angabe von Hardware und Bedingungen; Schwellen sollen aus M1-Baselines entstehen statt erfunden zu werden. Browser-Automatisierung kann echte Latenz und GPU-Bildrate nicht belegen – die Werte müssen beim Gerätetest auf echten iPhones/iPads und dem echten PC abgelesen werden. Vorhanden waren nur `heartbeat`/`heartbeat-ack` (ADR-003, Herzschlag alle 5 s, ADR-009) und eine einzelne RTT im Controller-Reducer.

## Entscheidung

### Was gemessen und angezeigt wird

| Seite | Wert | Messung |
|---|---|---|
| Controller | **RTT** Median, p95, letzte, Anzahl (letzte 60) | `heartbeat { t: performance.now() }` → Server spiegelt → `heartbeat-ack { t }`; RTT = Empfangszeit − `t`. Nur Antworten auf **offene** Proben dieser Seite zählen (fremdes/doppeltes `t`, alte Verbindung → kein Messwert). |
| Controller | unbeantwortete Proben, gesendete Eingaben/s | Proben, die bei Verbindungsverlust offen waren oder verfallen (> 8 offen); Slot-Eingaben im letzten 1-s-Fenster. |
| Host | **Bildrate**, **Bildabstand** Median/p95 (letzte 300 Frames) | Abstand zwischen zwei `scene.onAfterRenderObservable`; fps = 1000 / Mittelwert. Lücken > 1 s (Tab im Hintergrund) zählen als „Pause“, nicht als Frame. |
| Host | **Eingabe→Frame** Median/p95, Anzahl (letzte 300) | Zeit vom Eintreffen einer `input`-Nachricht im Host-JS (synchron im WebSocket-`message`-Ereignis, nach der Prüfung) bis zum Ende des nächsten gerenderten Frames; jede Eingabe ein Wert. |
| beide | Gerät | Kurzform des User-Agents („Safari 18.2 / iOS 18.2“); Host zusätzlich WebGL-Version, Grafikkarte (`engine.getGlInfo()`, unmaskiert, wenn der Browser es erlaubt) und Render-Auflösung. |

- **Keine Schwellen, keine Ampeln.** Die Anzeige misst nur. Grenzwerte kommen nach dem M1-Gerätetest aus den dort notierten Werten.
- **Kein geschätzter Gesamtweg.** Controller-RTT und Host-„Eingabe→Frame“ liegen auf verschiedenen Uhren; eine Summe (z. B. RTT/2 + Eingabe→Frame) wäre eine Schätzung und wird nicht angezeigt. Der Host kennt die RTT der Controller nicht.
- **„Kopieren“** legt eine Zeile (Werte + Gerät + voller User-Agent) in die Zwischenablage. `navigator.clipboard` gibt es nur in sicheren Kontexten; der Controller läuft im LAN über `http://<ip>` – dort erscheint die Zeile stattdessen markiert in einem Textfeld zum manuellen Kopieren. Kein `document.execCommand` (veraltet).

### Einschalten

- `?debug=1` (oder `true`) am Host (`/host/?debug=1`) und am Controller (`/?code=…&debug=1`, auch mit `seats=2–4`). `withSeats`/`withJoinCode` behalten den Parameter. Ohne Parameter wird **nichts** gerendert und nichts gemessen (Screenshot-Baselines unverändert).
- Controller mit `?debug=1`: Herzschlag **jede Sekunde** statt alle 5 s (`DEBUG_HEARTBEAT_INTERVAL_MS`), damit nach einer Minute 60 Werte vorliegen. Der Server ist dafür unverändert ausgelegt (jede Nachricht ist Lebenszeichen; 1/s liegt weit unter dem Rate-Limit von 60/s je Slot). Wachhund (10 s) und Server-Timeout (15 s) bleiben.

### Wo der Code liegt

- **`packages/metrics`** (neu, `@chaos-party/metrics`): Ringpuffer fester Größe, Median, Perzentil (Nearest-Rank: Rang ⌈p/100·n⌉, immer ein gemessener Wert), `summarize`, `formatMs`, `shortUserAgent`. Rein, ohne Abhängigkeiten. Eigenes Paket, weil Host **und** Controller es brauchen und es weder Protokoll (`packages/protocol`) noch Spielregel (`packages/game-core`) ist; ADR-002 legt Pakete an, „sobald es Inhalt dafür gibt“.
- Controller: `src/debug/latencyMeter.ts` (rein), Anbindung über die Option `latency` von `createControllerSession` (Proben beim Herzschlag und bei der Aufwach-Probe, Antworten, gesendete Eingaben, Verbindungsverlust); Anzeige `src/debug/DebugOverlay.tsx`.
- Host: `src/debug/frameMeter.ts` (rein, Zeitstempel von außen); `GameScene` bekommt `onFrameRendered()` und `getRendererInfo()`; `App` verbindet Meter mit Szene und Eingabe-Verteiler; Anzeige `src/debug/DebugOverlay.tsx`.
- Lage: Controller quer oben mittig (iPhone zwischen „verbunden“ und Spieler-Badge, iPad über der Zonengrenze), hoch links unter „verbunden“; `pointer-events: none` außer „Kopieren“. Host unten rechts. Monospace, halbtransparent.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Server-Zeitstempel / Uhrabgleich für Einweg-Latenz | Client-Uhren sind nicht vertrauenswürdig (B8), Abgleich ist eigene Arbeit und wieder nur eine Schätzung; RTT + Host-Messung reichen für eine Baseline |
| Gesamtlatenz „Finger → Bild“ automatisch messen | Braucht gemeinsame Uhr oder Kamera (Hochgeschwindigkeitsvideo); gehört in die Gerätecheckliste, nicht in den Code |
| `ws`-Ping/Pong für die RTT | Browser beantworten Pings auf Netzwerkebene, auch bei eingefrorener Seite (ADR-009); misst nicht die JS-Ereignisschleife, die Eingaben verarbeitet |
| Statistik je App duplizieren / in `protocol` oder `game-core` | Duplikat driftet; die anderen Pakete hätten einen fremden Zweck |
| Babylon `engine.getFps()` | Gleitender Mittelwert ohne p95 und ohne Pausenerkennung; eigener Ringpuffer ist genauso billig |
| `engine.onEndFrameObservable` | Feuert im Testmodus (`stepFrames` ruft nur `scene.render()`) nicht; `onAfterRenderObservable` deckt beide Wege ab |
| Herzschlag immer jede Sekunde | Mehr Funkverkehr für alle Spieler ohne Nutzen außerhalb der Messung |

## Konsequenzen

**Positiv**
- Ruben kann beim Gerätetest Werte je Gerät ablesen und als Zeile kopieren; daraus entstehen die M1-Baselines und später Schwellen.
- Ohne `?debug=1` ändert sich nichts am Verhalten oder Aussehen.

**Negativ / Risiken**
- **Eingabe→Frame** endet am Ende von `scene.render()` im JS, nicht beim Bild auf dem Monitor: GPU, Compositor, VSync und Monitor-Latenz fehlen (typisch weitere 1–3 Frames). Auch der Weg Server → Host-Browser bis zum JS-Ereignis ist nicht enthalten (gleicher PC, gering).
- **RTT** enthält WLAN, Server und beide Ereignisschleifen, aber nicht Server → Host → Bild. Auf iOS ist `performance.now()` grob (bis 1 ms), Werte < 1 ms sind ungenau.
- Im Host-Testmodus (`?test=1`) sind Bildrate/Bildabstand bedeutungslos (Frames nur per `stepFrames`); die Anzeige kennzeichnet das.
- E2E-Werte (Chromium, SwiftShader, localhost) sagen nichts über echte Geräte; der E2E-Test prüft nur, dass Zahlen erscheinen.
- `shortUserAgent` erkennt nur grob; iPadOS im Desktop-Modus erscheint als „macOS“. Der volle User-Agent steht in der kopierten Zeile.

## Überprüfung

Nach dem M1-Gerätetest: Werte in `docs/device-test-checklist.md`/Abnahmebericht festhalten und entscheiden, ob Schwellen (z. B. p95 Eingabe→Frame, p95 RTT) als Warnung oder Test-Gate eingeführt werden; neu bewerten, wenn eine Einweg-Latenz oder die Gesamtlatenz Finger → Bild gebraucht wird.
