# M1-Demo: Chaos Party auf PC, iPhones und iPad ausprobieren

**Stand:** 2026-11-14 · **Aufgabe:** CHAOS-15 · **Abnahme:** CHAOS-16 · **Checkliste:** [device-test-checklist.md](device-test-checklist.md)

Diese Anleitung reicht, um M1 allein zu testen. Das Spiel läuft nur auf dem PC; iPhones und iPad öffnen eine Webseite auf dem PC und sind reine Controller. Es gibt keinen Cloud-Dienst, alles bleibt im lokalen Netz.

## Was du brauchst

- Einen PC (Windows, macOS oder Linux) mit **Node.js 24** und aktuellem Chrome, Edge oder Firefox.
- Zwei iPhones und ein iPad mit aktuellem iOS/iPadOS (Safari).
- Ein **normales Heim-WLAN** für alle Geräte (kein Gäste-WLAN). Der PC darf per Kabel am selben Router hängen.

## 1. Einmalig einrichten (PC)

```bash
git clone https://github.com/rubenvitt/Chaos-Party.git
cd Chaos-Party
corepack enable          # liefert die passende pnpm-Version
pnpm install
```

## 2. Starten (PC)

```bash
pnpm build
pnpm start
```

Das Terminal zeigt:

- den **Link für die Handys**, z. B. `http://192.168.178.42:8787/?code=K7MX`, mit Begründung, warum diese Adresse gewählt wurde,
- den **Join-Code** (4 Zeichen) und einen QR-Code,
- andere Adressen des PCs und ignorierte Adapter (WSL, Docker, VPN …).

Beim ersten Start fragt **Windows** bzw. **macOS** eventuell, ob Node.js eingehende Verbindungen annehmen darf: für **private Netzwerke erlauben**. Details: [network-setup.md → Firewall](network-setup.md#firewall).

Stimmt die Adresse nicht (z. B. VPN-Adresse), mit fester Adresse starten:

```bash
PUBLIC_HOST=192.168.178.42 pnpm start      # macOS/Linux
$env:PUBLIC_HOST="192.168.178.42"; pnpm start   # Windows PowerShell
```

## 3. Spiel am PC öffnen

Im Browser **`http://localhost:8787/host/`** öffnen, am besten im Vollbild (F11 bzw. ⌃⌘F). Du siehst die Arena und darüber die Lobby mit QR-Code, Join-Code und Link. Oben rechts steht „Server: verbunden“.

## 4. iPhones verbinden

1. iPhone 1: **Kamera-App** öffnen, auf den QR-Code halten, Link antippen.
2. Der Controller öffnet sich in deiner Spielerfarbe mit Symbol (Kreis, Dreieck …). In der Lobby am PC erscheint der Spieler.
3. iPhone 2 genauso; es bekommt eine **andere** Farbe.
4. Ohne Kamera: auf dem iPhone `http://<Adresse>:8787/` öffnen und den Join-Code eintippen.

Kommt das iPhone nicht durch: [network-setup.md](network-setup.md) (Firewall, Gäste-WLAN, VPN). Schnelltest vom iPhone: `http://<Adresse>:8787/health` muss `{"status":"ok",…}` zeigen.

## 5. iPad als geteilter Controller (2 Spieler)

- In der Lobby am PC auf **„iPad (2 Spieler)“** umschalten und den QR-Code mit dem iPad scannen, **oder**
- auf dem iPad den Link mit `&seats=2` öffnen (z. B. `http://192.168.178.42:8787/?code=K7MX&seats=2`), **oder**
- auf dem iPad `http://<Adresse>:8787/` ohne Code öffnen und „2 Spieler · iPad“ wählen.

Das iPad zeigt zwei Zonen in zwei Spielerfarben: quer links/rechts, hoch oben/unten (die obere Zone ist für die gegenübersitzende Person um 180° gedreht). Jede Zone hat Joystick und Knöpfe A/B. Ein Finger gehört immer der Zone, in der er aufgesetzt wurde, auch wenn er über die Grenze rutscht.

Mit `&seats=3` oder `&seats=4` gibt es 3–4 Zonen (2×2). Das ist der skizzierte Weg zu vier Spielern, M1 verlangt nur zwei. Tipps gegen iPadOS-Systemgesten (Geführter Zugriff): [ipad-zonen.md](ipad-zonen.md).

## 6. Spielen

1. Auf jedem Controller **„Bereit!“** tippen.
2. Am PC **„Los geht’s!“** klicken (geht, sobald mindestens ein Spieler verbunden ist).
3. **Joystick** (links) bewegt die eigene Figur, **A** schubst (kurzer Stoß nach vorn), B macht in M1 dasselbe. Figuren stoßen sich gegenseitig an.

M1 ist ein technischer Durchstich: Es gibt kein Brett, keine Runden und kein Spielende. Neu starten = Server im Terminal mit Strg+C beenden und `pnpm start` erneut ausführen.

## 7. Verbindung testen

- iPhone sperren, kurz warten, entsperren: Der Controller zeigt „Verbindung verloren – verbinde neu …“ und kommt automatisch in **denselben** Slot zurück. Am PC ist der Spieler dazwischen grau mit „⚠ getrennt“ markiert, die Figur halbtransparent mit „!“.
- Seite neu laden, App wechseln, WLAN kurz aus: ebenso.
- Abbruch in der Lobby länger als 60 s: Der Platz wird frei; danach neu per QR beitreten.

## 8. Ohne Handys ausprobieren

`http://localhost:8787/host/?local=1` öffnet die Arena ohne Server; Steuerung per Tastatur (Spieler 1 WASD + Leertaste, Spieler 2 Pfeiltasten + Enter, Spieler 3 IJKL + O, Spieler 4 Ziffernblock 8/4/5/6 + 0). `?players=1–4` legt die Anzahl fest.

## 9. Ergebnis festhalten

Die Punkte in [device-test-checklist.md](device-test-checklist.md) durchgehen und eintragen: Gerät, iOS-Version, Netz, Ergebnis, Nachweis. Am Ende die Entscheidung **APPROVED / CHANGES REQUESTED / BLOCKED** im Chat oder als Kommentar an CHAOS-16.

## Bekannte Grenzen in M1

- Die automatischen Tests laufen in Chromium mit iPhone- und iPad-Emulation. Echtes iOS-Safari, echtes Multitouch, WLAN, Firewall und Latenz sind **nur** über die Checkliste belegt.
- Wer sich während des Spiels trennt, behält seinen Platz bis zum Server-Neustart. Ein Beitritt während des laufenden Spiels ist in M1 nicht vorgesehen.
- Knöpfe A und B zeigen nur „A“/„B“ und lösen beide den Schubser aus.
- Ein Schutz gegen das Zurück-Wischen in Safari fehlt; nach dem Zurückkehren verbindet sich der Controller wieder in denselben Slot.
