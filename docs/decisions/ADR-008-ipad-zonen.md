# ADR-008: Geteiltes iPad – Spielerzonen, Touch Events mit Zonen-Tracker, Drehen

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-13
**Betroffene Annahmen:** `docs/assumptions.md` A1, A2, A3, A6, A9, E4

## Kontext

Ein iPad soll 2 (später bis 4) Personen gleichzeitig als Controller dienen. Das Protokoll erlaubt bereits eine Verbindung mit 1–4 Slots (`join { seats }`, ADR-003/A9), der Controller-Client und der Reducer sind mehrslotfähig (ADR-006). Offen waren: wie die Zonen aussehen, wie Berührungen sicher der richtigen Zone gehören (auch bei gleichzeitigen Fingern, Fingern, die über die Grenze rutschen, Systemgesten und Drehen), und ob dafür Pointer Events (wie der iPhone-Controller) oder Touch Events genutzt werden. `ARCHITECTURE.md`: „map touch identifier → player zone at touch start and keep ownership until release/cancel. Explicitly handle concurrent touches and orientation changes.“

## Entscheidung

### Aktivierung

- URL `?code=ABCD&seats=2` (auch `3`/`4`); `?mode=ipad` ohne `seats` = 2 Plätze. Ungültige Werte → iPhone-Modus (1 Platz). Reine Funktion `parseLaunchParams` in `src/config.ts`.
- Die Sitzung tritt über **eine** Verbindung mit `join { seats: n }` bei und erhält n Slots; `createControllerSession`, Reducer, Fehlertexte und `seq` pro Verbindung bleiben unverändert.
- `App` zeigt bei **mehr als einem** Slot aus `welcome` das `ZoneBoard`, sonst wie bisher `SlotController` (iPhone unverändert).
- Die Code-Eingabe bietet „1 Spieler · iPhone“ / „2 Spieler · iPad“; die Wahl lädt die Seite mit `?seats=` neu (die Platzzahl steht fest, sobald die Sitzung beitritt).
- Das gemerkte Token wird im iPad-Modus nach Platzzahl getrennt (`src/tokenScope.ts`), damit ein Tab, der vorher als iPhone beigetreten war, per `reconnect` nicht nur einen Platz zurückbekommt.

### Ereignismodell: Touch Events auf einer stabilen Fläche

Der iPad-Modus liest `touchstart/touchmove/touchend/touchcancel` mit `changedTouches` und `Touch.identifier` an **einem** Element, der ganzen Spielfläche (`.zone-board`). Alle Kinder haben `pointer-events: none`; die Zuordnung zu Zone und Bedienelement macht ausschließlich der Zonen-Tracker per Geometrie. Gründe:

1. **Ziel bleibt stabil.** Touch-Folgen werden immer an das Element geschickt, auf dem der Finger aufsetzte. Verschwindet dieses Element (Kontextwechsel blendet einen Knopf aus), erreichen `touchmove`/`touchend` die Dokument-Handler nicht mehr – auf iOS ein bekannter Weg zu „hängenden“ Fingern. Mit der Fläche als einzigem Ziel kann das nicht passieren.
2. **Abgleich mit `touches`.** Jedes Touch-Ereignis enthält die Liste *aller* liegenden Finger. Der Router gleicht danach ab (`reconcile`): Was nicht mehr liegt, wird abgebrochen – auch wenn iPadOS bei einer übernommenen Systemgeste kein `touchend` schickt. Pointer Events liefern keinen solchen Gesamtstand.
3. **Eine Trefferprüfung für alles.** Zonen sind gedreht (180°); eine reine Rechteck-Geometrie, die Darstellung **und** Trefferprüfung teilt, ist unit-testbar ohne DOM und unabhängig von Capture-Semantik (Pointer Events haben auf Touch implizites Capture, `lostpointercapture`/`pointerleave` unterscheiden sich zwischen Engines).
4. Annahme A1 ist auf `Touch.identifier` formuliert; der Gerätetest prüft genau dieses Modell.

Der iPhone-Modus bleibt bei Pointer Events (ADR-006), unverändert und mit seinen Tests. Folge: Der iPad-Modus reagiert nicht auf Maus/Stift (zum Testen am Desktop: Geräteemulation mit Touch).

### Zonen-Tracker (rein, `src/zones/zoneTracker.ts`)

`createZoneTracker(zones)` → `start(id, p)`, `move(id, p)`, `end(id, p?)`, `cancel(id)`, `cancelAll()`, `reconcile(ids)`, `setZones(zones)`, `owner(id)`, `view(slot)`, `size`. Ausgabe sind Effekte `stick | press | release | ready` mit Slot; `ZoneBoard` übersetzt sie in Intents (`move` über den vorhandenen Drossler je Slot, ~30 Hz, Loslassen sofort).

Regeln:

- **Zuordnung nur beim Aufsetzen:** Zone per Trefferprüfung des Startpunkts, darin das Bedienelement (Knöpfe vor dem Joystick-Feld, Knöpfe mit 10 px Zugabe). Danach gehört der Finger dieser Zone und diesem Element bis `touchend`/`touchcancel`, auch wenn er über die Zonengrenze rutscht.
- **Joystick:** folgt nur der **ersten** Berührung, die auf ihm aufsetzt; weitere Finger dort sind wirkungslos und werden auch später nicht befördert. Schwebender Ursprung wie beim iPhone; Versatz wird in Zonen-Koordinaten zurückgedreht (Person gegenüber: Bildschirm-unten = vorn).
- **Knöpfe:** ein Finger pro Knopf, `press` beim Aufsetzen, `release` beim Abheben oder Abbrechen (bleibt gedrückt, wenn der Finger vom Knopf rutscht). Weitere Finger derselben Zone dürfen andere Knöpfe drücken.
- **Bereit-Knopf:** `ready` erst beim Abheben **auf** dem Knopf (Wegrutschen oder Abbrechen = nichts).
- **Ignoriert:** Berührungen im toten Randstreifen (16 px) zwischen Zonen und außerhalb jeder Zone. Berührungen in einer Zone neben allen Elementen gehören der Zone ohne Wirkung.
- **`touchcancel`, Fokusverlust, App-Wechsel, Unmount:** alles des betroffenen Fingers bzw. aller Finger loslassen: Joystick `{0, 0}`, Knöpfe `release`.
- **Kennungen** werden nach dem Abheben frei; ein erneutes `start` mit belegter Kennung bricht die alte Berührung zuerst ab.

### Drehen und Größenänderung

`resize`/`orientationchange` berechnen die Zonen neu (`setZones`). **Politik:** Ein Finger behält seine Zuordnung nur, wenn seine Zone **gleich liegt und gleich gedreht ist** und sein Bedienelement noch existiert. Sonst (Drehen ordnet die Zonen neu an; Kontextwechsel blendet das Element aus) wird er losgelassen (`{0, 0}`/`release`) und bis zum Abheben **stillgelegt** – er bekommt nie ein neues Element. Begründung: Nach dem Drehen haben alte Startpunkte keine Bedeutung mehr; ein Joystick, der mit einem Ursprung im alten Koordinatensystem weiterläuft, würde die Figur unkontrolliert bewegen. iPadOS bricht laufende Touches beim Drehen meist ohnehin mit `touchcancel` ab; die Politik gilt auch, falls nicht.

### Layout

Geometrie in `src/zones/geometry.ts` (rein): `arrangeZones`, `layoutZoneControls`, `buildZones`, `toLocal`/`toScreen`. Die Darstellung positioniert Zonen und Elemente absolut aus genau diesen Rechtecken.

- **2 Plätze quer:** links | rechts, beide aufrecht (nebeneinander an der langen Kante). Jede Zone ist hoch → Knöpfe oben, Joystick unten (wie das iPhone hochkant). Nicht gespiegelt: Alle lernen dieselbe Anordnung wie auf dem iPhone.
- **2 Plätze hoch:** unten aufrecht, oben um 180° gedreht (Personen sitzen sich gegenüber). Jede Zone ist breit → Gamepad-Anordnung (Joystick links, Knöpfe rechts, aus Sicht der jeweiligen Person).
- **3–4 Plätze:** 2×2-Raster, untere Reihe aufrecht, obere Reihe 180°, Reihenfolge im Uhrzeigersinn (unten links, unten rechts, oben rechts, oben links); bei 3 bleibt oben links frei.
- Jede Zone: Rahmen und Plakette in Spielerfarbe mit Symbol und Name, eigener Phasenkontext (Lobby „Bereit!“, Warten, Spiel). Bedienelemente ≥ 20 px vom Zonenrand, A ≥ 88 px, B ≥ 76 px (unit-getestet bis 656 × 944 px).

Skizzen und Grenzen für 3–4 Zonen: [`docs/ipad-zonen.md`](../ipad-zonen.md).

### Tests

- **Unit (ohne DOM):** Geometrie (Anordnung, Randstreifen, Drehung, Größen und Abstände für 2–4 Zonen auf mehreren iPad-Größen), Tracker (gleichzeitige Starts, Grenzüberschreitung, zweiter Finger, Abbruch, Abgleich, Kennungs-Wiederverwendung, Drehen, Kontextwechsel, gedrehte Richtung, Bereit-Knopf, 8 gleichzeitige Finger), Router (mehrere Finger pro Ereignis, Ursprung, verlorenes `touchend`), URL-Parameter, Token-Trennung.
- **E2E:** Projekte `ipad-quer`/`ipad-hoch` (`devices['iPad Pro 11' (landscape)]` in Chromium) gegen den Production-Build mit nachgebautem Session-Server (`seats` → n Slots, „bereit“ je Slot). Mehrfinger per CDP `Input.dispatchTouchEvent`: Joystick Zone 1 + A Zone 2 gleichzeitig, einen Finger heben während der andere weiterzieht, `touchCancel`, Grenzüberschreitung, gedrehte Zone, Drehen per Viewport-Wechsel, 4 Zonen mit 4 Fingern, Modus-Wahl und Neuladen. Gemessen: `touchEnd` beendet genau die übergebenen Punkte, die übrigen bleiben liegen (`TouchScreen.lift`).
- Screenshot-Baselines (Text maskiert) beider Ausrichtungen; Belege `docs/screenshots/m1-ipad-2-zonen.png`, `m1-ipad-2-zonen-hoch.png`, `m1-ipad-4-zonen.png` (`CONTROLLER_BELEG=1`).

**Chromium-Emulation beweist kein iPadOS-Multitouch.** Wie viele Finger iPadOS-Safari gleichzeitig meldet, ob `identifier` stabil bleibt, wann Systemgesten Touches stehlen und wie sich Drehen verhält (A1–A3, A6), zeigt nur das Gerät.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Pointer Events wie beim iPhone, je Element (`Joystick`/`ActionButton` mehrfach) | Ziel-Element kann mitten in der Geste verschwinden; kein Gesamtstand für verlorene Enden; Zuordnung hinge an DOM-Trefferprüfung gedrehter Elemente statt an testbarer Geometrie. |
| Pointer Events auf einer Fläche mit eigenem Tracker | Möglich; aber ohne `touches`-Liste kein Abgleich, und Pointer-Capture-Semantik unterscheidet sich zwischen WebKit und Chromium. Touch Events sind auf iPadOS die native Quelle. |
| Beide Modi auf Touch Events umstellen | Kein Gewinn fürs iPhone (ein Spieler, getestete Komponenten), aber Regressionsrisiko; Maus-Bedienung am Desktop ginge verloren. |
| Laufende Touches nach dem Drehen weiterführen (Ursprung umrechnen) | Fehleranfällig (Zone wechselt Lage, Größe, Drehung) und kein Spielgewinn; ein kurzer Stopp ist ehrlicher als eine Figur, die falsch weiterläuft. |
| Gespiegelte Zonen im Querformat (Knöpfe jeweils außen) | Rechte Person hätte den Joystick rechts – andere Muskelerinnerung als am iPhone; Mittelstreifen trennt Hände ausreichend. Wird nach dem Gerätetest neu bewertet (E4). |
| Eine Verbindung pro Zone | Widerspricht ADR-003/A9; mehrere Reconnects pro Gerät. |
| Drei Zonen als Drittel | Ungleiche Formen, mittlere Person ohne eigene Kante; 2×2 mit freiem Feld ist fairer und identisch zu 4. |

## Konsequenzen

**Positiv**
- Zonenlogik ist vollständig rein und schnell getestet; Darstellung und Trefferprüfung können nicht auseinanderlaufen.
- iPhone-Modus, Protokoll und Server bleiben unverändert; 3–4 Zonen sind ohne neues Konzept möglich.
- Verlorene Touch-Enden und Systemgesten führen nicht zu hängenden Knöpfen oder laufenden Figuren.

**Negativ / Risiken**
- iPad-Modus nur per Touch bedienbar (kein Maus-Fallback).
- Echte Grenzen (Anzahl gleichzeitiger Finger, Systemgesten mit 4–5 Fingern, Handlungsraum am Tisch) sind ungeprüft; bei 4 Personen ist das iPad eng (E4).
- Lesbarkeit der Plakette für Personen an der Seite (Querformat, 2 Zonen) hängt von der Sitzordnung ab.
- Der Host-QR (CHAOS-11) verlinkt den iPhone-Modus; für iPads muss man in der Code-Eingabe „iPad“ wählen oder `&seats=2` anhängen.

## Überprüfung

Neu bewerten nach dem Gerätetest (CHAOS-15): wenn iPadOS weniger als 8 gleichzeitige Finger zuverlässig meldet, wenn Systemgesten trotz Geführtem Zugriff stören, wenn `touchcancel` beim Drehen ausbleibt oder Personen die Gamepad-Anordnung der gedrehten Zonen nicht verstehen.
