# Netzwerk einrichten: Handys mit dem Spiel-PC verbinden

**Stand:** 2026-11-14 · **Aufgabe:** CHAOS-11 · **Entscheidung:** [ADR-007](decisions/ADR-007-lan-join.md)

Chaos Party läuft auf dem PC. iPhones und iPads öffnen nur eine Webseite auf dem PC (Controller) und schicken Eingaben per WebSocket. Dafür müssen die Geräte den PC **direkt im lokalen Netz** erreichen – es gibt keinen Cloud-Dienst dazwischen.

## Kurzanleitung

1. PC und alle Handys/iPads ins **selbe WLAN** bringen (PC darf per Kabel am selben Router hängen).
2. Im Projektordner: `pnpm build && pnpm start`.
3. Am PC im Browser **`http://localhost:8787/host/`** öffnen (Vollbild: F11 bzw. ⌃⌘F).
4. Mit der Kamera-App den **QR-Code** scannen – oder auf dem Handy die angezeigte Adresse (z. B. `http://192.168.178.42:8787/?code=AB12`) eintippen. Der Join-Code steht groß daneben.
5. Wenn alle drin sind: **„Los geht’s!“** am PC.

Das Terminal zeigt beim Start, welche Adresse im QR-Code steckt und warum, welche anderen Adressen der PC hat und welche ignoriert wurden.

## Wenn das Handy die Seite nicht öffnet

Gehe die Punkte der Reihe nach durch. Die Lobby zeigt nach 30 s ohne Controller einen Hinweis darauf.

| Symptom | Wahrscheinliche Ursache | Abschnitt |
|---|---|---|
| Seite lädt ewig, dann „Safari kann die Seite nicht öffnen“ | Firewall am PC blockiert Port 8787 | [Firewall](#firewall) |
| Funktioniert am PC selbst (`http://<IP>:8787`), nicht vom Handy | Firewall oder Client-Isolation | [Firewall](#firewall), [Gäste-WLAN](#gäste-wlan-und-client-isolation) |
| Adresse im QR beginnt mit `172.`, `100.` oder gehört zu einem VPN | falsche Netzwerkschnittstelle gewählt | [Andere Adresse wählen](#andere-adresse-wählen) |
| QR zeigt `localhost` | PC hat keine LAN-Adresse (nicht im WLAN?) | [Andere Adresse wählen](#andere-adresse-wählen) |
| `http://localhost:8787/host/` zeigt 404 oder eine fremde Seite, Terminal warnt „antwortet ein anderes Programm“ | Ein anderes Programm lauscht auf `127.0.0.1:8787` (macOS erlaubt das neben Chaos Party) | Link aus dem Terminal nehmen (LAN-Adresse), anderes Programm beenden oder `PORT=<anderer Port> pnpm start` (CHAOS-48) |
| Handy im Gäste-WLAN / Hotel / Uni-Netz | Geräte dürfen sich nicht sehen | [Gäste-WLAN](#gäste-wlan-und-client-isolation) |
| Klappt, aber nur manchmal / bricht ab | Mesh-Wechsel, VPN, Energiesparen | [Mesh](#mesh-wlan-und-repeater), [VPN](#vpn-auf-dem-pc) |

**Schneller Test vom Handy:** `http://<Adresse>:8787/health` öffnen. Erscheint `{"status":"ok",…}`, ist das Netz in Ordnung und das Problem liegt woanders.

### Firewall

Der Server lauscht auf **TCP-Port 8787** (Seite und WebSocket auf demselben Port). Die Firewall muss eingehende Verbindungen dorthin erlauben – aber nur im **privaten** Netz.

**Windows (Defender Firewall)**

- Beim ersten `pnpm start` fragt Windows „Zugriff zulassen?“ für **Node.js JavaScript Runtime**. Haken bei **Private Netzwerke** setzen, *Öffentliche Netzwerke* aus lassen, „Zugriff zulassen“.
- Dialog verpasst oder abgelehnt? *Windows-Sicherheit → Firewall- & Netzwerkschutz → Zugriff von Apps durch die Firewall zulassen → Einstellungen ändern* → bei allen Einträgen „Node.js …“ **Privat** ankreuzen.
- Alternativ gezielt nur den Port freigeben (PowerShell als Administrator):
  `New-NetFirewallRule -DisplayName "Chaos Party 8787" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow -Profile Private`
- **Wichtig:** Das WLAN muss in Windows als **privates Netzwerk** eingestuft sein (*Einstellungen → Netzwerk und Internet → WLAN → <Netz> → Netzwerkprofiltyp: Privat*). Im Profil „Öffentlich“ greift die Freigabe nicht.

**macOS**

- *Systemeinstellungen → Netzwerk → Firewall*: Ist sie aus, ist nichts zu tun.
- Ist sie an: Beim ersten Start fragt macOS „Eingehende Verbindungen für node akzeptieren?“ → **Erlauben**. Verpasst? *Firewall → Optionen…* → `node` hinzufügen bzw. auf „Eingehende Verbindungen erlauben“ stellen. „Alle eingehenden Verbindungen blockieren“ muss aus sein.
- Node über Homebrew/nvm aktualisiert? Dann ist es eine neue Programmdatei, und macOS fragt erneut.

**Linux:** z. B. `sudo ufw allow 8787/tcp` (nur, wenn `ufw` aktiv ist).

Drittanbieter-Sicherheitssoftware (Norton, Kaspersky, ESET, Bitdefender …) hat oft eine eigene Firewall – dort ebenfalls Node.js/Port 8787 im Heimnetz erlauben.

### Gäste-WLAN und Client-Isolation

Viele Router trennen Geräte im **Gäste-WLAN** voneinander („Client-Isolation“, „AP-Isolation“, „Station-Isolation“, bei der FRITZ!Box: Gastzugang). Dann kommen Handys ins Internet, aber nicht zum PC – das Spiel kann so **nicht** funktionieren.

- PC **und** Handys ins normale Heim-WLAN, nicht ins Gästenetz.
- Firmen-, Hotel-, Uni- und öffentliche WLANs isolieren fast immer. Ausweg: **Hotspot** eines Handys/Laptops nutzen und PC + alle Controller dort anmelden (das Hotspot-Handy kann selbst mitspielen).
- Bei eigenem Router die Option „Geräte dürfen untereinander kommunizieren“ bzw. „AP-Isolation aus“ suchen (FRITZ!Box: unter *WLAN → Sicherheit* die Option, dass WLAN-Geräte untereinander kommunizieren dürfen; genaue Bezeichnung je nach Firmware).
- Getrennte 2,4-/5-GHz-Netze desselben Routers sind normalerweise **dasselbe** Netz – das ist kein Problem.

### Mesh-WLAN und Repeater

Mesh-Systeme (Deco, Eero, FRITZ!Mesh, Google Wifi …) sind meist ein einziges Netz und funktionieren. Stolperfallen:

- Ein Repeater im **eigenen** Netzwerk (anderer Name/anderes Subnetz, „Router-Modus“ statt „Access-Point-Modus“) trennt die Geräte. Alle Geräte müssen eine Adresse aus demselben Bereich haben (z. B. alle `192.168.178.x`).
- Wechselt ein Handy während des Spiels den Mesh-Knoten, kann die Verbindung kurz abreißen; die Wiederverbindung kommt mit CHAOS-12.
- Gästenetz-Funktionen des Mesh-Systems isolieren wie oben beschrieben.

### VPN auf dem PC

Ein aktives VPN (Firmen-VPN, NordVPN, Proton, Tailscale, WireGuard, ZeroTier …) kann

- die **lokale Erreichbarkeit** sperren („LAN-Zugriff blockieren“ / „Kill Switch“) – im VPN-Client „Zugriff auf lokales Netzwerk erlauben“ aktivieren oder das VPN fürs Spielen trennen;
- eine **zusätzliche Adresse** mitbringen. Der Server ignoriert bekannte VPN-Adapter (`utun*`, `tun*`, `tap*`, `wg*`, `tailscale*`, `zt*`, Namen mit „VPN“) und `100.64.x.x`-Adressen landen ganz hinten. Unbekannte Adapternamen können trotzdem gewählt werden → [Andere Adresse wählen](#andere-adresse-wählen).

### WSL, Docker, Hyper-V, VirtualBox, VMware

Diese legen virtuelle Netzwerkkarten an (`vEthernet (WSL)`, `vEthernet (Default Switch)`, `docker0`, `br-…`, `veth…`, `vboxnet*`, `VirtualBox Host-Only Network`, `vmnet*`, `VMware Network Adapter …`). Deren Adressen (oft `172.16–31.x.x` oder `192.168.56.x`) sind vom Handy aus **nicht** erreichbar; der Server filtert sie nach Namen heraus und listet sie im Terminal unter „Nicht verwendet“.

**Den Server nicht in WSL oder in einem Container starten**, sondern direkt unter Windows/macOS: Aus WSL2/Docker heraus sieht der Server nur die virtuelle Adresse, und Handys kommen ohne Portweiterleitung nicht hinein. Wer das trotzdem will: Portweiterleitung einrichten (`netsh interface portproxy …` bzw. `docker run -p 8787:8787`) und `PUBLIC_HOST=<LAN-IP des Windows-PCs>` setzen.

## Andere Adresse wählen

Der Server wählt automatisch (Regeln in [ADR-007](decisions/ADR-007-lan-join.md)): private Adressen `192.168.x.x` vor `10.x.x.x` vor `172.16–31.x.x`, physisch aussehende Namen (WLAN, Ethernet, `en0`, `eth0`, `wlan0`) bevorzugt, virtuelle Adapter ausgeschlossen.

1. **In der Lobby umschalten:** Kennt der PC mehrere passende Adressen, erscheint unter dem QR-Code „Andere Adresse“. Die Auswahl ändert sofort QR-Code und Link – kein Neustart nötig.
2. **Adresse erzwingen:** Server mit Umgebungsvariable starten.
   - macOS/Linux: `PUBLIC_HOST=192.168.178.42 pnpm start`
   - Windows PowerShell: `$env:PUBLIC_HOST="192.168.178.42"; pnpm start`
   - Windows cmd: `set PUBLIC_HOST=192.168.178.42 && pnpm start`

   `PUBLIC_HOST` darf auch ein Name sein, den die Handys auflösen können (z. B. `spiele-pc.fritz.box` oder `spiele-pc.local`).
3. **Port im Link ändern:** `PUBLIC_PORT=…` (z. B. hinter einer Portweiterleitung oder beim Controller-Dev-Server). Der Server selbst lauscht weiter auf `PORT` (Standard 8787).

**Eigene IP herausfinden:** Windows `ipconfig` (Eintrag „Drahtlos-LAN-Adapter WLAN“ → IPv4-Adresse), macOS *Systemeinstellungen → WLAN → Details* oder `ipconfig getifaddr en0`, Linux `ip -4 addr`.

## Umgebungsvariablen des Servers

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `8787` | Port für Seiten, `/ws` und `/health` |
| `HOST` | `0.0.0.0` | Bind-Adresse. Eine konkrete Adresse beschränkt den Server darauf (dann auch der QR-Link); `127.0.0.1` macht ihn für Handys unerreichbar. |
| `PUBLIC_HOST` | automatisch | Adresse/Name im QR-Link erzwingen |
| `PUBLIC_PORT` | wie `PORT` | Port im QR-Link |
| `JOIN_CODE` | zufällig (4 Zeichen) | Fester Join-Code (4–8 Zeichen `A–Z`, `0–9`), z. B. für Demos |
| `TERMINAL_QR` | an | `0` = keinen QR-Code im Terminal zeichnen |

## Entwicklung (Vite-Dev-Server)

- Server: `pnpm --filter @chaos-party/server dev` (Port 8787).
- Host: `pnpm --filter @chaos-party/host dev` → `http://localhost:5173/host/`. Vite leitet `/ws` an `localhost:8787` weiter (`CHAOS_SERVER_PORT` ändert den Zielport).
- Der QR-Link zeigt im Dev-Betrieb auf den Node-Server (Port 8787) mit der **gebauten** Controller-App. Wer den Controller-Dev-Server testen will, startet den Server mit `PUBLIC_PORT=5174`.
- `http://localhost:5173/host/?local=1` startet die Arena ohne Server mit Tastatursteuerung (`?players=1–4`).

## Was nur echte Geräte zeigen

Automatische Tests prüfen Adresswahl, Link, Auslieferung und Lobby (Unit-Tests und Playwright gegen `127.0.0.1`). **Nicht** prüfbar ohne echte Geräte und echtes WLAN: Scan mit der iOS-Kamera, Erreichbarkeit über WLAN, Firewall-Dialoge, Client-Isolation, Mesh-Wechsel. Diese Punkte stehen in der Gerätecheckliste (`docs/device-test-checklist.md`, CHAOS-15) und gelten erst nach dem Test mit echten Geräten als bestätigt (Annahmen B1, B2, B4).
