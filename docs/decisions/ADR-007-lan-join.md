# ADR-007: QR-Join über eine LAN-Adresse, ein Prozess für Host und Controller

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-11
**Betroffene Annahmen:** `docs/assumptions.md` B1, B2, B3, B4, B5, B9, C1

## Kontext

Handys treten per QR-Code bei. `ARCHITECTURE.md` verlangt: QR-Links zeigen auf eine **im LAN erreichbare Adresse, nicht auf `localhost`**. Ein Spiel-PC hat aber oft viele Adressen: WLAN, Ethernet, VPN (`utun`, WireGuard, Tailscale), WSL/Hyper-V (`vEthernet`), Docker (`docker0`, `br-…`), VirtualBox/VMware, AirDrop (`awdl`), IPv6-Link-Local. Wählt der Server die falsche, scheitert der Join ohne verständliche Fehlermeldung. Zusätzlich blockieren Firewall und Gäste-WLAN (Client-Isolation) den Zugriff (B1, B2) – das lässt sich nicht automatisch beheben, nur erklären.

Bisher lieferte der Server (CHAOS-9, ADR-005) nur die Controller-App aus; der Host lief separat über `vite preview`. Für die Demo soll Ruben **einen** Befehl starten und **eine** URL am PC öffnen.

## Entscheidung

### Adresswahl (rein, unit-getestet: `apps/server/src/network.ts`)

`rankAddresses(os.networkInterfaces())` liefert sortierte Kandidaten mit Begründung und die ausgeschlossenen Adressen mit Grund:

1. **Ausschließen:** `internal`, Loopback (`127/8`, `::1`), IPv4-Link-Local `169.254/16`, IPv6-Link-Local `fe80::/10`, Multicast/reserviert, IPv6 überhaupt, solange der Server nur auf IPv4 lauscht (Standard `HOST=0.0.0.0`), und **virtuelle Adapter nach Namen**: `docker*`, `br-*`, `veth*`, `virbr*`, `vEthernet*`, `*WSL*`, `vmnet*`, `*VMware*`, `*VirtualBox*`, `vboxnet*`, `*Hyper-V*`, `utun*`, `tun*`, `tap*`, `*tailscale*`, `zt*`, `*ZeroTier*`, `wg*`, `*WireGuard*`, `awdl*`, `llw*`, `bridge<n>`, `anpi*`, `ppp*`, `ipsec*`, CNI/Podman/LXC-Brücken, Namen mit `VPN`, `Hamachi`, `NordLynx`, `Npcap`, `Loopback`. Ein Linux-`br0` bleibt erlaubt (häufig echte LAN-Brücke für VMs).
2. **Sortieren nach Bereich:** `192.168/16` (300) > `10/8` (200) > `172.16/12` (100) > öffentliches IPv4 (40) > IPv6-ULA (20) > `100.64/10` CGNAT, typisch VPN (10) > globales IPv6 (5).
3. **Innerhalb eines Bereichs:** physisch aussehende Namen (`en<n>`, `eth*`, `enp*/eno*/ens*`, `wl*`/`wlan*`, `Wi-Fi`, `WLAN`, `Ethernet*`, `LAN-Verbindung`, `Local Area Connection`) +50 – kleiner als jeder Bereichsabstand. Gleichstand → Reihenfolge der Tabelle (stabil).

`resolveJoinTarget` entscheidet: **`PUBLIC_HOST`** (IP oder DNS-Name, geprüft) gewinnt immer; sonst eine konkrete **Bind-Adresse** (`HOST=192.168.…`); sonst der beste Kandidat; gibt es keinen, **`localhost` mit Warnung** im Terminal. **`PUBLIC_PORT`** ersetzt den Port im Link. Alle übrigen Kandidaten werden (höchstens 8) zu alternativen Links – außer bei konkreter Bind-Adresse, weil andere Adressen dann nicht erreichbar sind.

### Join-URL

`http://<adresse>:<port>/?code=<JOINCODE>` – gebaut mit `URL` (IPv6 in eckigen Klammern, Port 80 entfällt). Der Controller liest `?code=`. Nur `http`: Für M1 sind keine Secure-Context-Features nötig (B5); iOS öffnet `http://<LAN-IP>` aus der Kamera-App (B4, Gerätetest).

### Protokoll (additiv)

`lobby` bekommt das optionale Feld **`joinUrlAlternatives?: string[]`** (max. 8, gleiche URL-Prüfung wie `joinUrl`: nur `http(s)`, ≤ 512 Zeichen). Fehlt es, bleibt die Nachricht wie bisher gültig. Der Host schaltet den QR-Code per Auswahl „Andere Adresse“ **ohne Server-Rundreise** um, weil alle Kandidaten auf denselben Server zeigen. `PROTOCOL_VERSION` bleibt 1.

### Ein Prozess, ein Port

`pnpm build && pnpm start` startet den Node-Server auf **8787** mit:

| Pfad | Inhalt |
|---|---|
| `/` | Controller-App (`apps/controller/dist`), SPA-Fallback |
| `/host/` | Host-App (`apps/host/dist`), SPA-Fallback auf **deren** `index.html`; `/host` → 301 auf `/host/` (Query bleibt) |
| `/ws` | WebSocket (Controller und Host) |
| `/health` | Gesundheitscheck |

Statische Auslieferung bleibt pfadsicher: Der Präfix `/host` wird abgeschnitten, dann prüft dieselbe Funktion wie bisher (`decodeURIComponent` → `normalize` → `resolve` → muss im Wurzelverzeichnis liegen; `%2e%2e`, `..%2f`, `%5c` getestet). `/hostile` landet nicht im Host. Fehlt der Host-Build, antwortet `/host/` mit 404 und dem Hinweis `pnpm build`.

Die Host-App baut mit **`base: '/host/'`** (Dev, Preview und Build). Havok-WASM wird weiter per `?url` + `locateFile` geladen und liegt damit unter `/host/assets/HavokPhysics-<hash>.wasm`; der Node-Server liefert `application/wasm` (C1, E2E-geprüft).

Startausgabe im Terminal: PC-URL `http://localhost:8787/host/`, Join-Code, Join-Link mit Quelle und Begründung, weitere Adressen, nicht verwendete virtuelle/Link-Local-Adressen, Warnungen, Hinweis auf `PUBLIC_HOST` und `docs/network-setup.md`, dazu ein QR-Code als Unicode-Blöcke (nur in einem TTY, abschaltbar mit `TERMINAL_QR=0`). QR-Bibliothek in Host und Server: **`uqr`** (MIT, ohne Abhängigkeiten).

### Host ↔ Server

- Der Host verbindet sich immer mit **`/ws` am eigenen Ursprung** (`ws(s)://<location.host>/ws`). In Produktion ist das der Node-Server. Im **Vite-Dev-Server** (5173, ebenfalls unter `/host/`) leitet ein Proxy `/ws` an `ws://localhost:8787` weiter (`CHAOS_SERVER_PORT` zum Umstellen). Ein Proxy statt fest verdrahtetem Port hält den Host-Code frei von Umgebungsweichen.
- Anmeldung mit `host-hello`; als „verbunden“ gilt der Host erst mit der ersten `lobby` (ein zweites Host-Fenster bekommt Close 4002 → Anzeige „Anderes Spielfenster ist schon verbunden – warte …“). Bei Trennung neuer Versuch alle 2 s. Heartbeat/Timeouts: CHAOS-12.
- `WebSocketInputSource` implementiert die `InputSource`-Naht aus ADR-004: `move {x, y}` → Stick 1:1 (`y > 0` = Stick nach oben = vom Bildschirm weg); `press`/`release` von **A und B** → Schubser (in M1 gibt es nur eine Aktion, B soll nicht „tot“ wirken); `gesture`/`reaction` → keine Wirkung.
- `lobby`-Schnappschüsse bestimmen die Spieler der Szene (nur beigetretene Slots, getrennte halbtransparent) und die React-Lobby. Farben/Bezeichnungen/Symbole kommen aus `PLAYER_SLOTS` des Protokolls bzw. vom Server; die vorläufigen Host-Farben (`PLAYER_COLORS`) sind entfernt.

### Betriebsarten des Hosts

- **Server-Modus (Standard):** Lobby mit QR-Code (SVG im DOM, Fehlerkorrektur M, Rand 4 Module), Join-Code, Link, Adressauswahl, Spielerliste (Farbe, Symbol, Name, verbunden/bereit), Start-Knopf (aktiv ab einem verbundenen Spieler), nach 30 s ohne Controller Hinweis „Firewall/WLAN prüfen“ (`?joinHint=<s>` für Tests). Im Spiel verschwindet die Lobby, unten bleiben kompakte Spieler-Chips. Die Tastatur steuert zusätzlich beigetretene Slots (Fehlersuche).
- **Lokaler Modus (`?local=1`):** wie CHAOS-8 – keine Verbindung, `?players=1–4` Demo-Spieler per Tastatur. Damit bleiben die Szenen-E2E-Tests unabhängig vom Netzwerk.

### Tests

- Unit: Adressrangfolge mit Windows (WLAN + WSL/Hyper-V/VirtualBox), macOS (en0 + utun + awdl/llw + bridge100), Linux (wlan0 + docker0/br-/veth/tailscale), Bereichs- und Namensrangfolge, Link-Local, IPv6 an/aus, nur Loopback → `localhost` + Warnung; URL-Bau (IPv6-Klammern, Port, Code, ungültige Eingaben); Overrides; statische Auslieferung unter `/host/` inkl. Traversal, SPA-Fallback, Redirect, WASM-MIME; Host-Verbindung mit Fake-Socket (Retry, 4002, `start`, Aufräumen); Eingabe-Übersetzung.
- E2E (Chromium) gegen den **echten Node-Server** mit Production-Builds (`pnpm build && node apps/server/dist/main.js`, Port 4180, `HOST=127.0.0.1`, `PUBLIC_HOST=127.0.0.1`, `JOIN_CODE=E2ETEST`): QR + Code + Link, Hinweis nach `joinHint`, Adress-Umschaltung (Lobby per `routeWebSocket` um eine Alternative ergänzt), zweites Host-Fenster, zwei synthetische Controller (join → ready), Lobby-Liste, Start, `move` bewegt Figur 1, Knopf A schubst Figur 2, Trennung wird angezeigt. Die bisherigen Szenen-Tests laufen im lokalen Modus unter `/host/`. `vite preview` wird für E2E nicht mehr verwendet.

> **Überholt (CHAOS-46, 2026-11-17):** Der gemeinsame E2E-Server auf Port 4180 gilt nicht mehr. Seit CHAOS-14 baut `tests/e2e/global-setup.ts` einmal, und die Fixture `chaosServer` startet für jeden Test einen eigenen Server auf einem freien Port (`createChaosServer`, nur `127.0.0.1`, `JOIN_CODE=E2ETEST`). Aktueller Aufbau: [`docs/testing.md`](../testing.md), Abschnitt „E2E-Aufbau“. Die Entscheidung dieses ADR (ein Server liefert Host, Controller und WebSocket aus) bleibt unverändert.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Erste nicht-interne IPv4 nehmen | Auf Windows mit WSL/Hyper-V und auf Macs mit VPN regelmäßig falsch (vEthernet/utun stehen oft vorn). |
| Standardroute ermitteln (Socket zu 8.8.8.8 „verbinden“, lokale Adresse lesen) | Ohne Internet unbrauchbar; bei aktivem VPN mit Full-Tunnel liefert es die VPN-Adresse. |
| mDNS/Bonjour (`spiele-pc.local`) als Standard | Auf Windows nicht verlässlich, Gäste-/Mesh-Netze filtern Multicast; als `PUBLIC_HOST`-Wert möglich. |
| Adresswahl in der Host-UI mit Server-Neustart | Unnötig: Der Server lauscht auf allen Adressen, nur der Link ändert sich. |
| Host weiter getrennt per `vite preview` | Zwei Prozesse, zwei Ports, zwei Firewall-Fragen; Demo umständlicher; C1 nicht am echten Auslieferungsweg geprüft. |
| `base: './'` (relative Asset-Pfade) | Bricht beim SPA-Fallback für tiefere Pfade unter `/host/…`; `'/host/'` ist eindeutig. |
| Host verbindet sich im Dev fest auf `:8787` | Umgebungsweiche im Code und Cross-Origin-WebSocket; der Vite-Proxy ist eine Zeile Konfiguration. |
| Bibliothek `qrcode` | Funktioniert, zieht aber für Node `pngjs`/`yargs` mit; `uqr` deckt SVG-Daten und Terminal ab, ohne Abhängigkeiten. |
| Lokales HTTPS für den Join | Für M1 nicht nötig (B5); selbstsignierte Zertifikate erzeugen auf iOS Warnseiten. Erst bei Secure-Context-Bedarf (Sensoren, A8). |

## Konsequenzen

**Positiv**
- Ein Befehl, eine URL am PC; QR-Link automatisch auf die plausibelste LAN-Adresse, mit Begründung im Terminal und Ausweg per Auswahl oder `PUBLIC_HOST`.
- Die Adresswahl ist vollständig unit-getestet; neue Adapternamen sind eine Zeile plus Testfall.
- E2E prüft den echten Auslieferungsweg (Node-Server, `/host/`, WASM-MIME, WebSocket) statt `vite preview`.
- Controller-E2E können denselben Server nutzen (Controller unter `/`).

**Negativ / Risiken**
- Namensheuristiken sind unvollständig: Ein VPN-Adapter mit neutralem Windows-Namen („Ethernet 3“) kann gewinnen, wenn er eine `192.168.x.x`-Adresse hat. Abhilfe: Auswahl in der Lobby oder `PUBLIC_HOST`.
- Erreichbarkeit, Firewall, Client-Isolation und Kamera-Scan sind automatisch **nicht** prüfbar (B1, B2, B4) – nur Doku, Lobby-Hinweis und Gerätecheckliste.
- Die E2E-Session ist pro Lauf eine einzige; Lobby-Tests laufen seriell in fester Reihenfolge.
- Ein IPv6-only-Netz wird nur mit `HOST=::` unterstützt (dann IPv6-Kandidaten hinter IPv4).
- Im Vite-Dev-Betrieb zeigt der QR-Link auf die *gebaute* Controller-App am Node-Server, nicht auf den Controller-Dev-Server (`PUBLIC_PORT=5174` stellt um).

## Überprüfung

Neu bewerten, wenn der Gerätetest (CHAOS-15) zeigt, dass die automatische Wahl auf Rubens PC falsch liegt oder der Kamera-Scan von `http://`-Links scheitert, wenn ein Secure-Context-Feature nötig wird (dann Spike „lokales HTTPS“), oder wenn mehrere Sessions pro Prozess kommen.
