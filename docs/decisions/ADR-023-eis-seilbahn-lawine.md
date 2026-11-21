# ADR-023: Eis, Seilbahn und Lawine als optionale Brett-Daten im Regelkern

**Status:** Angenommen
**Datum:** 2026-11-20
**Aufgabe:** CHAOS-198 (Brett „Frostgipfel“), Epic CHAOS-195
**Betroffene Annahmen:** ADR-011 (Brett als Daten, Regelkern als reiner Reducer), ADR-022 (drehende Felder)

## Kontext

Das Themenbrett „Frostgipfel“ soll eigene Brett-Mechaniken haben (Ruben, 2026-11-19: Thema bestätigt, Details frei): Eisfelder lassen die Figur weiterrutschen, eine Lawine räumt in festen Abständen einen Wegabschnitt ab (Figuren dort verlieren Münzen), eine Seilbahn ist eine Abkürzung gegen Münzen. ADR-022 hat für das Karussell vorgemacht, wie eine Mechanik als Brett-Daten plus reine Funktion von Brett und Runde ohne Protokolländerung auskommt. Diese ADR hält fest, wie die drei neuen Mechaniken in dasselbe Muster passen.

Randbedingungen wie in ADR-022: Regelkern deterministisch und seed-basiert, keine neue Nachricht und kein neues Feld in `BoardView`, PC- und Apple-Host stellen alles aus Brett und `round` dar, Bretter ohne die neuen Felder verhalten sich unverändert.

## Entscheidung

1. **Datenmodell (alles optional, additiv in `BoardDefinition`):**
   - `ice?: string[]`: Eisfelder. Je Eisfeld genau ein Nachfolger, kein Start-, Trophäen- oder drehendes Feld; Eis im Kreis und Rutschpartien, die auf einem Trophäenfeld enden, sind ungültig.
   - `cableCars?: { from, to, price }[]`: Seilbahn als **echte Kante** in `from.next` (nicht an erster Stelle). Damit sehen Prüfung, Trophäen-Abstände und Bot-Wege sie ohne Sonderfall.
   - `avalanche?: { every, coins, zones: { name, spaces }[] }`: Lawinen.
   Kein neuer `SpaceKind`: Feldtypen sind in Protokoll, Controller und beiden Hosts erschöpfend aufgezählt.
2. **Eis:** Endet ein Wurf auf Eis, rutscht die Figur in `enterSpaceEvent` vor Falle und Feldwirkung weiter (auf Eis wieder, bis festes Feld). Ein zusätzliches `moved` derselben Figur, kein neues Ereignis; die Anzeige-Pause wächst um `stepMs` je gerutschtem Feld. Wer über Eis läuft oder vom Windstoß dorthin geweht wird, rutscht nicht.
3. **Seilbahn:** `pathOptions(ctx, id, slot)` filtert zu teure Seilbahnen heraus; bleibt ein Weg, gibt es keine Wegwahl. Die Option zeigt den Preis als `PromptOption.detail`. Beim Wählen zahlt die Figur (`coins-changed`, Grund `event`) und fährt in einem Schritt. Der kostenlose Weg ist immer die erste Option und damit die Standardwahl bei Zeitablauf oder Trennung. Ein Windstoß fährt nie gratis Seilbahn.
4. **Lawine als reine Funktion der Runde:** Zu Beginn von Runde `r` (`r > 1`, `(r - 1) % every === 0`) geht die Lawine ab, reihum über `zones` (`avalancheAt`). Wer auf einem Feld der Zone steht, verliert `coins` Münzen (Grund `space`, zählt als Pech). Eine Runde vorher sagen beide Hosts sie an (`avalancheWarning`, Einblendung und Ticker an `round-started`), beim Abgang zeigt die Kamera den Hang. Kein neues Ereignis: Hosts rechnen aus Brett und `round`.
5. **Prüfung:** `validateBoard` prüft alle drei Mechaniken ausführlich; `createGame` lehnt ab, was den Regelkern festfahren würde (Endlos-Rutschen, unbekannte Felder, Seilbahn als Standardoption).

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Neue Feldtypen `ice`, `cable`, `avalanche` | Erschöpfende Aufzählungen in Protokoll, Controller (Feldfarben), PC- und Apple-Host; viel Fläche für dieselbe Regel. |
| Eigene Ereignisse `ice-slide`, `avalanche`, Grund `toll` | Protokollerweiterung (strikte Schemas) plus Swift-Vertrag, Fixtures und Texte; die Hosts erkennen die Rutschpartie am zweiten `moved` und die Lawine an Brett und Runde. |
| Lawine per Zufall oder am Rundenende nach dem Minispiel | Zufall ist nicht planbar; Rundenende fiele mit Minispiel-Ergebnis und Rückenwind zusammen. Am Rundenbeginn ist die Warnung eine Runde vorher eindeutig. |
| Seilbahn als eigene Wegfolge aus „Gondel-Feldern“ | Mehr Felder ohne Spielwert und Feldwirkungen in der Luft; eine Kante mit Preis ist klarer. |
| Lawine schiebt Figuren ins Tal | Auf dem Frostgipfel läge „Tal“ oft in Laufrichtung und wäre ein Geschenk; Münzverlust ist eindeutig. |

## Konsequenzen

**Positiv**
- Kein Protokoll- oder Swift-Vertrag geändert; Wackelwald und Rummelplatz verhalten sich unverändert (alle bestehenden Tests grün).
- Die Mechaniken sind wiederverwendbar (Eis oder Seilbahn auf künftigen Brettern) und einzeln geprüft.
- Bot-Simulation zählt Rutschpartien, Seilbahnfahrten und Lawinentreffer (`simulateGame`).

**Negativ / Risiken**
- Die Rutschpartie erkennt der Host heuristisch (zweites `moved` derselben Figur nach dem Lauf, Start auf Eis). Am Apple-Host erscheint dafür nur das Popup „Rutsch!“, nicht die Tickerzeile.
- Der Seilbahn-Preis ist ein `coins-changed` mit Grund `event`; der Ticker sagt „verliert 8 Münzen“ statt „zahlt die Fahrt“.
- Die Lawine ist eine reine Münzstrafe; ob sie am Tisch als Spannung oder als Ärger wirkt, zeigt erst der Spieltest.

## Überprüfung

Nach dem Spieltest am Fernseher (Gerätecheckliste §43): Ist die Lawinen-Warnung eine Runde vorher klar? Wird die Seilbahn gezielt genutzt, und ist die Rutschpartie nachvollziehbar?
