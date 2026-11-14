/**
 * Wahl der LAN-Adresse für den Join-Link (CHAOS-11, ADR-007).
 *
 * Alles hier ist rein: Die Schnittstellentabelle (`os.networkInterfaces()`) und
 * die Umgebungsvariablen werden übergeben, damit Unit-Tests beliebige
 * Rechner (Windows mit WSL/Hyper-V, macOS mit VPN, Linux mit Docker) nachstellen
 * können. QR-Links müssen auf eine im WLAN erreichbare Adresse zeigen, nie auf
 * `localhost` (`ARCHITECTURE.md`, Runtime topology).
 */
import { isIPv4, isIPv6 } from 'node:net';

/** Ein Eintrag aus `os.networkInterfaces()` (nur die Felder, die wir brauchen). */
export interface InterfaceAddress {
  readonly address: string;
  /** Node ≥ 18 liefert `'IPv4' | 'IPv6'`, Node 18.0–18.3 zeitweise `4 | 6`. */
  readonly family: string | number;
  readonly internal: boolean;
}

export type InterfaceTable = Readonly<Record<string, readonly InterfaceAddress[] | undefined>>;

export interface AddressCandidate {
  readonly address: string;
  readonly interfaceName: string;
  readonly family: 'IPv4' | 'IPv6';
  /** Höher = besser. Nur für die Reihenfolge, keine feste Skala. */
  readonly score: number;
  /** Deutsche Begründungen für die Ausgabe im Terminal. */
  readonly reasons: readonly string[];
}

export type ExclusionKind = 'family' | 'internal' | 'ipv6-disabled' | 'range' | 'virtual';

export interface ExcludedAddress {
  readonly address: string;
  readonly interfaceName: string;
  readonly kind: ExclusionKind;
  readonly reason: string;
}

export interface RankResult {
  /** Beste zuerst. */
  readonly candidates: readonly AddressCandidate[];
  readonly excluded: readonly ExcludedAddress[];
}

export interface RankOptions {
  /** IPv6-Adressen berücksichtigen (nur sinnvoll, wenn der Server auf `::` lauscht). */
  readonly includeIPv6?: boolean;
}

/**
 * Namen virtueller Adapter, die Handys im WLAN nicht erreichen: Docker, WSL,
 * Hyper-V, VirtualBox, VMware, VPNs (utun, tun/tap, WireGuard, Tailscale,
 * ZeroTier), Apple-AirDrop/AWDL, Internet-Sharing-Brücken.
 * Ein echtes Linux-`br0` (Brücke für VMs mit LAN-Anschluss) bleibt bewusst erlaubt.
 */
const VIRTUAL_NAME_PATTERNS: readonly RegExp[] = [
  /^docker/i,
  /^br-/i,
  /^veth/i,
  /^virbr/i,
  /^vethernet/i,
  /wsl/i,
  /^vmnet/i,
  /vmware/i,
  /virtualbox/i,
  /^vboxnet/i,
  /hyper-v/i,
  /^utun/i,
  /^tun/i,
  /^tap/i,
  /tailscale/i,
  /^zt/i,
  /zerotier/i,
  /^wg/i,
  /wireguard/i,
  /^awdl/i,
  /^llw/i,
  /^bridge\d/i,
  /^anpi/i,
  /^ppp/i,
  /^ipsec/i,
  /^cni/i,
  /^flannel/i,
  /^cali/i,
  /^podman/i,
  /^lxc/i,
  /^lxd/i,
  /vpn/i,
  /hamachi/i,
  /nordlynx/i,
  /npcap/i,
  /loopback/i,
];

/** Namen, die nach echter Netzwerkkarte aussehen (WLAN oder Kabel). */
const PHYSICAL_NAME_PATTERNS: readonly RegExp[] = [
  /^en\d/i,
  /^enp/i,
  /^eno/i,
  /^ens/i,
  /^eth/i,
  /^wlan/i,
  /^wl/i,
  /^wi-?fi/i,
  /^ethernet/i,
  /^lan-verbindung/i,
  /^local area connection/i,
  /^drahtlos/i,
];

function isVirtualName(name: string): boolean {
  return VIRTUAL_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function isPhysicalName(name: string): boolean {
  return PHYSICAL_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function normalizeFamily(family: string | number): 'IPv4' | 'IPv6' | undefined {
  if (family === 'IPv4' || family === 4) return 'IPv4';
  if (family === 'IPv6' || family === 6) return 'IPv6';
  return undefined;
}

function ipv4Octets(address: string): [number, number, number, number] | undefined {
  if (!isIPv4(address)) return undefined;
  const parts = address.split('.').map(Number);
  const [a, b, c, d] = parts;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return undefined;
  return [a, b, c, d];
}

interface RangeInfo {
  /** `undefined` → Adresse ausschließen, Text ist dann der Grund. */
  score: number | undefined;
  text: string;
}

function classifyIPv4(address: string): RangeInfo {
  const octets = ipv4Octets(address);
  if (!octets) return { score: undefined, text: 'keine gültige IPv4-Adresse' };
  const [a, b] = octets;
  if (a === 127) return { score: undefined, text: 'Loopback (nur dieser PC)' };
  if (a === 0) return { score: undefined, text: 'unspezifizierte Adresse' };
  if (a === 169 && b === 254) {
    return { score: undefined, text: 'Link-Local 169.254/16 (kein DHCP, kein Netz)' };
  }
  if (a >= 224) return { score: undefined, text: 'Multicast/reserviert' };
  if (a === 192 && b === 168) return { score: 300, text: 'privates Netz 192.168/16' };
  if (a === 10) return { score: 200, text: 'privates Netz 10/8' };
  if (a === 172 && b >= 16 && b <= 31) return { score: 100, text: 'privates Netz 172.16/12' };
  if (a === 100 && b >= 64 && b <= 127) {
    return { score: 10, text: 'CGNAT 100.64/10 (oft VPN wie Tailscale)' };
  }
  return { score: 40, text: 'öffentliche IPv4-Adresse' };
}

function classifyIPv6(address: string): RangeInfo {
  const lower = address.toLowerCase();
  if (lower === '::1' || lower === '::')
    return { score: undefined, text: 'Loopback (nur dieser PC)' };
  if (/^fe[89ab]/.test(lower)) {
    return { score: undefined, text: 'IPv6-Link-Local (braucht Zonen-ID, im QR unbrauchbar)' };
  }
  if (/^f[cd]/.test(lower)) return { score: 20, text: 'IPv6 ULA (lokal)' };
  return { score: 5, text: 'globale IPv6-Adresse' };
}

/** Bonus für physisch aussehende Namen; kleiner als jeder Abstand zwischen Adressbereichen. */
const PHYSICAL_BONUS = 50;

/**
 * Bewertet alle Adressen: wirft Loopback, Link-Local und virtuelle Adapter
 * hinaus und sortiert den Rest. Reihenfolge: privates IPv4 (192.168 > 10 > 172.16)
 * vor sonstigem IPv4 vor IPv6; innerhalb eines Bereichs gewinnen physisch
 * aussehende Namen (en0, eth0, wlan0, „WLAN“, „Ethernet“), danach entscheidet
 * die Reihenfolge der Tabelle (stabil).
 */
export function rankAddresses(table: InterfaceTable, options: RankOptions = {}): RankResult {
  const candidates: (AddressCandidate & { order: number })[] = [];
  const excluded: ExcludedAddress[] = [];
  let order = 0;

  for (const [interfaceName, entries] of Object.entries(table)) {
    for (const entry of entries ?? []) {
      order++;
      const exclude = (kind: ExclusionKind, reason: string) => {
        excluded.push({ address: entry.address, interfaceName, kind, reason });
      };
      const family = normalizeFamily(entry.family);
      if (!family) {
        exclude('family', 'unbekannte Adressfamilie');
        continue;
      }
      if (entry.internal) {
        exclude('internal', 'interne Schnittstelle (Loopback)');
        continue;
      }
      if (family === 'IPv6' && options.includeIPv6 !== true) {
        exclude('ipv6-disabled', 'IPv6 – Server lauscht nur auf IPv4');
        continue;
      }
      const range = family === 'IPv4' ? classifyIPv4(entry.address) : classifyIPv6(entry.address);
      if (range.score === undefined) {
        exclude('range', range.text);
        continue;
      }
      if (isVirtualName(interfaceName)) {
        exclude('virtual', 'virtueller Adapter (Docker/WSL/VM/VPN)');
        continue;
      }
      const reasons = [range.text];
      let score = range.score;
      if (isPhysicalName(interfaceName)) {
        score += PHYSICAL_BONUS;
        reasons.push('Name sieht nach WLAN/Ethernet aus');
      }
      candidates.push({ address: entry.address, interfaceName, family, score, reasons, order });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  return {
    candidates: candidates.map(({ address, interfaceName, family, score, reasons }) => ({
      address,
      interfaceName,
      family,
      score,
      reasons,
    })),
    excluded,
  };
}

// ---------------------------------------------------------------------------
// Override per Umgebung und Join-URL
// ---------------------------------------------------------------------------

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;

/** Entfernt eckige Klammern um IPv6 (`[fd00::1]` → `fd00::1`). */
function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** `true` für IPv4, IPv6 (auch in Klammern) oder einen DNS-Namen. */
export function isValidPublicHost(host: string): boolean {
  const bare = stripBrackets(host);
  if (isIPv4(bare) || isIPv6(bare)) return true;
  // Reine Zahlen-Punkt-Folgen, die kein gültiges IPv4 sind (z. B. 999.1.1.1), ablehnen.
  if (/^[\d.]+$/.test(bare)) return false;
  return HOSTNAME_PATTERN.test(bare);
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Baut den Join-Link `http://<adresse>:<port>/?code=<JOINCODE>`; IPv6 kommt in
 * eckige Klammern, Port 80 entfällt (Normalisierung durch `URL`).
 */
export function buildJoinUrl(host: string, port: number, joinCode: string): string {
  const bare = stripBrackets(host.trim());
  if (!isValidPublicHost(bare)) throw new Error(`Ungültige Adresse für den Join-Link: ${host}`);
  if (!isValidPort(port)) throw new Error(`Ungültiger Port für den Join-Link: ${String(port)}`);
  const authority = isIPv6(bare) ? `[${bare}]` : bare;
  const url = new URL(`http://${authority}:${String(port)}/`);
  url.searchParams.set('code', joinCode);
  return url.toString();
}

export type JoinTargetSource = 'env' | 'bind' | 'auto' | 'fallback';

export interface JoinTarget {
  /** Adresse im Join-Link (IP oder Hostname, ohne Klammern). */
  readonly host: string;
  readonly port: number;
  readonly source: JoinTargetSource;
  readonly joinUrl: string;
  /** Join-Links der übrigen Kandidaten (ohne den gewählten), beste zuerst. */
  readonly alternatives: readonly string[];
  readonly candidates: readonly AddressCandidate[];
  readonly excluded: readonly ExcludedAddress[];
  /** Deutsche Warnungen für das Terminal. */
  readonly warnings: readonly string[];
}

export interface ResolveJoinTargetInput {
  readonly interfaces: InterfaceTable;
  /** Umgebung (`PUBLIC_HOST`, `PUBLIC_PORT`). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Port, auf dem der Server tatsächlich lauscht. */
  readonly listenPort: number;
  /** Adresse, an die der Server gebunden ist (`HOST`, Standard `0.0.0.0`). */
  readonly bindHost: string;
  readonly joinCode: string;
  /** Höchstzahl alternativer Links (Protokoll: 8). */
  readonly maxAlternatives?: number;
}

const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]', '']);

function isLoopbackHost(host: string): boolean {
  const bare = stripBrackets(host).toLowerCase();
  return bare === 'localhost' || bare === '::1' || bare.startsWith('127.');
}

/**
 * Entscheidet, welche Adresse im QR-Code landet:
 * 1. `PUBLIC_HOST` (IP oder Hostname) gewinnt immer – manuelle Auswahl.
 * 2. Ist der Server an eine konkrete Adresse gebunden (`HOST=192.168.1.20`), nur diese.
 * 3. Sonst der beste Kandidat aus `rankAddresses`.
 * 4. Gibt es keinen, `localhost` mit Warnung (Handys erreichen das nicht).
 *
 * `PUBLIC_PORT` ersetzt den Port im Link (z. B. Controller-Dev-Server oder Port-Weiterleitung).
 */
export function resolveJoinTarget(input: ResolveJoinTargetInput): JoinTarget {
  const warnings: string[] = [];
  const maxAlternatives = input.maxAlternatives ?? 8;

  let port = input.listenPort;
  const rawPort = input.env.PUBLIC_PORT?.trim();
  if (rawPort) {
    const parsed = Number(rawPort);
    if (isValidPort(parsed)) {
      port = parsed;
    } else {
      warnings.push(
        `PUBLIC_PORT=${rawPort} ist kein gültiger Port (1–65535) – nutze ${String(port)}.`,
      );
    }
  }

  const bind = input.bindHost.trim();
  const includeIPv6 = bind === '::' || bind === '[::]';
  const ranked = rankAddresses(input.interfaces, { includeIPv6 });

  let host: string | undefined;
  let source: JoinTargetSource = 'auto';

  const rawPublic = input.env.PUBLIC_HOST?.trim();
  if (rawPublic) {
    if (isValidPublicHost(rawPublic)) {
      host = stripBrackets(rawPublic);
      source = 'env';
      if (isLoopbackHost(host)) {
        warnings.push(
          `PUBLIC_HOST=${rawPublic} zeigt auf diesen PC selbst – Handys können den Link nicht öffnen.`,
        );
      }
    } else {
      warnings.push(`PUBLIC_HOST=${rawPublic} ist weder IP noch Hostname – wähle automatisch.`);
    }
  }

  if (host === undefined && !WILDCARD_HOSTS.has(bind)) {
    host = stripBrackets(bind);
    source = 'bind';
    if (isLoopbackHost(host)) {
      warnings.push(
        `Server lauscht nur auf ${bind} – Handys im WLAN erreichen ihn nicht. HOST=0.0.0.0 setzen.`,
      );
    }
  }

  if (host === undefined) {
    const best = ranked.candidates[0];
    if (best) {
      host = best.address;
      source = 'auto';
    } else {
      host = 'localhost';
      source = 'fallback';
      warnings.push(
        'Keine LAN-Adresse gefunden (nur Loopback/virtuelle Adapter). Ist der PC im WLAN/LAN? ' +
          'Notfalls PUBLIC_HOST=<IP des PCs> setzen (docs/network-setup.md).',
      );
    }
  }

  const joinUrl = buildJoinUrl(host, port, input.joinCode);
  const alternatives: string[] = [];
  // Lauscht der Server nur auf einer bestimmten Adresse, sind andere nicht erreichbar.
  const boundToOne = !WILDCARD_HOSTS.has(bind);
  for (const candidate of boundToOne ? [] : ranked.candidates) {
    if (alternatives.length >= maxAlternatives) break;
    const url = buildJoinUrl(candidate.address, port, input.joinCode);
    if (url !== joinUrl && !alternatives.includes(url)) alternatives.push(url);
  }

  return {
    host,
    port,
    source,
    joinUrl,
    alternatives,
    candidates: ranked.candidates,
    excluded: ranked.excluded,
    warnings,
  };
}
