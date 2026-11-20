# ADR-021: Drehende Felder (Karussell) als feste Runden-Drehung im Regelkern

**Status:** Angenommen
**Datum:** 2026-11-20
**Aufgabe:** CHAOS-199 (Brett „Rummelplatz“), Epic CHAOS-195
**Betroffene Annahmen:** ADR-011 (Brett als Daten, Regelkern als reiner Reducer)

## Kontext

Das dritte Brett „Rummelplatz bei Nacht“ soll eine eigene Brett-Mechanik haben: Ein Karussell in der Mitte dreht sich jede Runde und verbindet dadurch wechselnde Wege (Ruben, 2026-11-19: Thema bestätigt, Details frei). Bisher ist das Brett eine feste Topologie (`BoardSpace.next`, ADR-011). Gabeln fragen den Spieler; sonst gibt es genau einen Nachfolger. Eine wechselnde Verbindung braucht also eine Erweiterung des Datenmodells und der Bewegung.

Randbedingungen: Der Regelkern bleibt deterministisch und seed-basiert (gleicher Seed, gleiche Befehle, gleicher Ablauf). Das Protokoll (`BoardView`) und beide Hosts (PC und nativer Apple-Host) sollen ohne neue Nachricht wissen, wohin das Karussell gerade zeigt. Die Wegwahl muss für Spieler planbar bleiben (Party-Spiel, kurze Erklärung).

## Entscheidung

1. **Datenmodell:** `BoardDefinition.rotations?: BoardRotation[]` mit `{ space, exits }`. `space.next` nennt weiter **alle** Ausgänge, die statische Topologie bleibt vollständig (Prüfung, Wegpfeile, Gras-Aussparung, Kamera, Export-Anker).
2. **Drehung als reine Funktion der Runde:** In Runde `r` gilt `exits[(r - 1) % exits.length]` (`rotationExit`, `activeNext` in `packages/game-core/src/board/rotation.ts`). Kein Zufall, kein Zustand, kein Ereignis. Hosts rechnen die Stellung aus `BoardView.round` mit demselben Helfer.
3. **Bewegung:** Laufen (`walkSegment`), Windstoß (`gustForward`) und Wegwahl (`openPathPrompt`) nehmen `nextOf(ctx, id)`, also am drehenden Feld nur den aktuellen Ausgang. Ein drehendes Feld ist **keine** Gabel: keine Wegwahl, auch wenn `next` mehrere Ziele hat (`isChoiceFork`).
4. **Ansage:** Führt ein Gabel-Weg ohne weitere Gabel in ein drehendes Feld, bekommt die Option einen Zusatz „Karussell → <Wegweiser des Ausgangs>“ (`PromptOption.detail`, schon im Protokoll).
5. **Abstände:** Bots (Simulation) messen Wege mit der Stellung der aktuellen Runde. Die Trophäen-Wanderung (`stepsAhead`) misst über alle Ausgänge, weil sich das Karussell bis zur Ankunft meist weitergedreht hat.
6. **Prüfung:** `validateBoard` verlangt bekanntes Feld, mindestens zwei verschiedene Ausgänge gleich `next`, höchstens eine Drehung je Feld und in **jeder** Stellung (kgV der Drehlängen, höchstens 60 Runden) von jedem Feld einen Weg zurück zum Start. `createGame` lehnt unpassende Drehungen ab.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Drehung per Zufall (seeded) je Runde oder je Zug | Nicht planbar, für Hosts nur über eine neue Nachricht oder ein neues Feld in `BoardView` sichtbar. |
| Stellung als Zustand im `GameState` plus Ereignis `carousel-turned` | Mehr Protokoll- und Regieänderungen (Server, Controller, beide Hosts) für dasselbe Ergebnis; die Funktion der Runde reicht. |
| Karussell als normale Gabel mit wechselnden Optionen | Wegwahl am Karussell selbst nimmt der Mechanik den Witz (das Karussell entscheidet) und verdoppelt Prompts. |
| Dynamische `next` direkt im Brett (Brett je Runde neu erzeugen) | Bricht die Annahme „Brett ist unveränderlich“ (Caches, Export-Anker, Hosts). |

## Konsequenzen

**Positiv**
- Kleine, additive Änderung: Bretter ohne `rotations` verhalten sich exakt wie vorher (alle bestehenden Tests unverändert grün).
- Kein neues Protokollfeld; PC- und Apple-Host stellen das Karussell aus `round` dar.
- Jede Stellung ist geprüft, niemand bleibt in einer Runde gefangen.

**Negativ / Risiken**
- Die Stellung wechselt mit der Runde, nicht mit dem Zug: Wer zuletzt zieht, sieht dieselbe Stellung wie der Erste. Gewollt (planbar), aber im Spieltest zu prüfen.
- Hosts müssen `activeNext` kennen, wenn sie Wege hervorheben wollen; Wegpfeile zeigen weiter alle Ausgänge.
- Weitere Brett-Mechaniken (CHAOS-198: Eisfelder, Lawine, Seilbahn) brauchen eigene Erweiterungen; diese ADR ist kein allgemeines Mechanik-System.

## Überprüfung

Nach dem Spieltest am Fernseher (Gerätecheckliste §39): Ist die Stellung lesbar, und fühlt sich die Ost-Ausfahrt („Ehrenrunde“ zurück in die Geisterbahn) eher lustig als unfair an? Sonst Drehung je Zug oder andere Ausgänge.
