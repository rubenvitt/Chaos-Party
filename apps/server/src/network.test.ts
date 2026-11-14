import { describe, expect, it } from 'vitest';
import {
  buildJoinUrl,
  isValidPublicHost,
  rankAddresses,
  resolveJoinTarget,
  type InterfaceAddress,
  type InterfaceTable,
} from './network.ts';

const v4 = (address: string, internal = false): InterfaceAddress => ({
  address,
  family: 'IPv4',
  internal,
});
const v6 = (address: string, internal = false): InterfaceAddress => ({
  address,
  family: 'IPv6',
  internal,
});

/** Windows 11 mit WSL2, Hyper-V-Default-Switch, VirtualBox und WLAN. */
const WINDOWS_WSL: InterfaceTable = {
  'vEthernet (WSL (Hyper-V firewall))': [v6('fe80::1234:5678:9abc:def0'), v4('172.24.80.1')],
  'vEthernet (Default Switch)': [v4('172.30.144.1')],
  'VirtualBox Host-Only Network': [v4('192.168.56.1')],
  WLAN: [v6('fe80::aaaa:bbbb:cccc:dddd'), v4('192.168.178.42')],
  'Loopback Pseudo-Interface 1': [v6('::1', true), v4('127.0.0.1', true)],
};

/** macOS-Laptop: WLAN en0, VPN utun, AirDrop awdl, Internet-Sharing-Brücke. */
const MACOS_VPN: InterfaceTable = {
  lo0: [v4('127.0.0.1', true), v6('::1', true), v6('fe80::1', true)],
  en0: [v6('fe80::1c2d:3e4f:5a6b:7c8d'), v4('192.168.1.23'), v6('fd12:3456:789a::23')],
  awdl0: [v6('fe80::d0e1:f2ff:fe03:1425')],
  llw0: [v6('fe80::d0e1:f2ff:fe03:1426')],
  utun3: [v4('10.8.0.6')],
  utun4: [v4('100.101.102.103')],
  bridge100: [v4('192.168.2.1')],
};

/** Linux-Desktop mit Docker, Docker-Compose-Netz und WLAN im 10er-Netz. */
const LINUX_DOCKER: InterfaceTable = {
  lo: [v4('127.0.0.1', true), v6('::1', true)],
  docker0: [v4('172.17.0.1')],
  'br-3f2a1b0c9d8e': [v4('172.18.0.1')],
  veth1a2b3c4: [v6('fe80::42:acff:fe11:2')],
  wlan0: [v4('10.0.0.57'), v6('fe80::2a3b:4c5d:6e7f:8091')],
  tailscale0: [v4('100.88.12.34')],
};

describe('rankAddresses', () => {
  it('Windows: WLAN gewinnt gegen WSL, Hyper-V und VirtualBox', () => {
    const { candidates, excluded } = rankAddresses(WINDOWS_WSL);
    expect(candidates.map((c) => c.address)).toEqual(['192.168.178.42']);
    expect(candidates[0]?.interfaceName).toBe('WLAN');
    const reasons = Object.fromEntries(excluded.map((e) => [e.address, e.reason]));
    expect(reasons['172.24.80.1']).toMatch(/virtuell/);
    expect(reasons['172.30.144.1']).toMatch(/virtuell/);
    expect(reasons['192.168.56.1']).toMatch(/virtuell/);
    expect(reasons['127.0.0.1']).toMatch(/Loopback/);
  });

  it('macOS: en0 vor VPN; utun, awdl, llw und bridge100 fliegen raus', () => {
    const { candidates, excluded } = rankAddresses(MACOS_VPN);
    expect(candidates.map((c) => `${c.interfaceName} ${c.address}`)).toEqual(['en0 192.168.1.23']);
    const excludedNames = new Set(excluded.map((e) => e.interfaceName));
    for (const name of ['utun3', 'utun4', 'awdl0', 'llw0', 'bridge100', 'lo0']) {
      expect(excludedNames.has(name), name).toBe(true);
    }
  });

  it('Linux: wlan0 vor docker0, br-*, veth und tailscale', () => {
    const { candidates } = rankAddresses(LINUX_DOCKER);
    expect(candidates.map((c) => c.address)).toEqual(['10.0.0.57']);
    expect(candidates[0]?.reasons).toContain('privates Netz 10/8');
  });

  it('sortiert private Bereiche 192.168 > 10 > 172.16 vor dem Namen', () => {
    const { candidates } = rankAddresses({
      eth0: [v4('172.20.1.5')],
      eth1: [v4('10.1.2.3')],
      foo0: [v4('192.168.0.9')],
      eth2: [v4('8.8.4.4')],
    });
    expect(candidates.map((c) => c.address)).toEqual([
      '192.168.0.9',
      '10.1.2.3',
      '172.20.1.5',
      '8.8.4.4',
    ]);
  });

  it('bevorzugt im selben Bereich physisch aussehende Namen, sonst Tabellenreihenfolge', () => {
    const { candidates } = rankAddresses({
      'Unbekannt 7': [v4('192.168.0.20')],
      'Ethernet 2': [v4('192.168.0.21')],
      'Sonstiges 9': [v4('192.168.0.22')],
    });
    expect(candidates.map((c) => c.address)).toEqual([
      '192.168.0.21',
      '192.168.0.20',
      '192.168.0.22',
    ]);
    expect(candidates[0]?.reasons).toContain('Name sieht nach WLAN/Ethernet aus');
  });

  it('wirft 169.254/16 (kein DHCP) und Multicast hinaus', () => {
    const { candidates, excluded } = rankAddresses({
      eth0: [v4('169.254.10.20')],
      eth1: [v4('224.0.0.1')],
    });
    expect(candidates).toEqual([]);
    expect(excluded.map((e) => e.reason)).toEqual([
      expect.stringMatching(/Link-Local/),
      expect.stringMatching(/Multicast/),
    ]);
  });

  it('lässt ein Linux-br0 (VM-Brücke mit LAN) zu, br-<id> von Docker nicht', () => {
    const { candidates } = rankAddresses({
      br0: [v4('192.168.0.50')],
      'br-abcdef': [v4('192.168.100.1')],
    });
    expect(candidates.map((c) => c.address)).toEqual(['192.168.0.50']);
  });

  it('ignoriert IPv6 standardmäßig, rankt es mit includeIPv6 hinter IPv4', () => {
    const table: InterfaceTable = {
      en0: [v6('fd00::5'), v6('2001:db8::5'), v6('fe80::5'), v4('10.0.0.5')],
    };
    expect(rankAddresses(table).candidates.map((c) => c.address)).toEqual(['10.0.0.5']);
    expect(rankAddresses(table, { includeIPv6: true }).candidates.map((c) => c.address)).toEqual([
      '10.0.0.5',
      'fd00::5',
      '2001:db8::5',
    ]);
  });

  it('versteht numerische Familien (Node 18.0–18.3) und überspringt leere Einträge', () => {
    const { candidates } = rankAddresses({
      eth0: [{ address: '192.168.1.2', family: 4, internal: false }],
      eth1: undefined,
      eth2: [{ address: 'x', family: 'AppleTalk', internal: false }],
    });
    expect(candidates.map((c) => c.address)).toEqual(['192.168.1.2']);
  });
});

describe('buildJoinUrl', () => {
  it('baut http://<adresse>:<port>/?code=<CODE>', () => {
    expect(buildJoinUrl('192.168.178.42', 8787, 'AB12')).toBe(
      'http://192.168.178.42:8787/?code=AB12',
    );
  });

  it('setzt IPv6 in eckige Klammern (auch wenn schon geklammert)', () => {
    expect(buildJoinUrl('fd00::5', 8787, 'AB12')).toBe('http://[fd00::5]:8787/?code=AB12');
    expect(buildJoinUrl('[fd00::5]', 8787, 'AB12')).toBe('http://[fd00::5]:8787/?code=AB12');
  });

  it('akzeptiert Hostnamen und lässt Port 80 weg', () => {
    expect(buildJoinUrl('spiele-pc.local', 80, 'ZZZZ')).toBe('http://spiele-pc.local/?code=ZZZZ');
  });

  it.each([
    ['leer', '', 8787],
    ['Pfad', 'evil.com/x', 8787],
    ['Schema', 'http://x', 8787],
    ['Leerzeichen', 'a b', 8787],
    ['kaputtes IPv4', '999.1.1.1', 8787],
    ['Port 0', '192.168.0.1', 0],
    ['Port zu groß', '192.168.0.1', 70000],
  ])('lehnt %s ab', (_name, host, port) => {
    expect(() => buildJoinUrl(host, port, 'AB12')).toThrow();
  });

  it('isValidPublicHost erkennt IPs und Namen', () => {
    for (const ok of ['10.0.0.1', 'fd00::1', '[fd00::1]', 'pc', 'pc.fritz.box']) {
      expect(isValidPublicHost(ok), ok).toBe(true);
    }
    for (const bad of ['', '-pc', 'pc_1', 'a/b', '1.2.3', 'javascript:alert(1)']) {
      expect(isValidPublicHost(bad), bad).toBe(false);
    }
  });
});

describe('resolveJoinTarget', () => {
  const base = {
    interfaces: WINDOWS_WSL,
    env: {},
    listenPort: 8787,
    bindHost: '0.0.0.0',
    joinCode: 'AB12',
  };

  it('wählt automatisch die beste Adresse', () => {
    const target = resolveJoinTarget(base);
    expect(target).toMatchObject({
      host: '192.168.178.42',
      port: 8787,
      source: 'auto',
      joinUrl: 'http://192.168.178.42:8787/?code=AB12',
      alternatives: [],
      warnings: [],
    });
  });

  it('listet weitere Kandidaten als Alternativen (ohne die gewählte)', () => {
    const target = resolveJoinTarget({
      ...base,
      interfaces: { eth0: [v4('192.168.0.10')], wlan0: [v4('10.0.0.10')] },
    });
    expect(target.joinUrl).toBe('http://192.168.0.10:8787/?code=AB12');
    expect(target.alternatives).toEqual(['http://10.0.0.10:8787/?code=AB12']);
  });

  it('PUBLIC_HOST und PUBLIC_PORT überschreiben die Wahl', () => {
    const target = resolveJoinTarget({
      ...base,
      env: { PUBLIC_HOST: ' spiele-pc.local ', PUBLIC_PORT: '5174' },
    });
    expect(target.source).toBe('env');
    expect(target.joinUrl).toBe('http://spiele-pc.local:5174/?code=AB12');
    expect(target.alternatives).toEqual(['http://192.168.178.42:5174/?code=AB12']);
    expect(target.warnings).toEqual([]);
  });

  it('warnt bei PUBLIC_HOST=localhost, nutzt es aber (Tests, Einzelplatz)', () => {
    const target = resolveJoinTarget({ ...base, env: { PUBLIC_HOST: '127.0.0.1' } });
    expect(target.joinUrl).toBe('http://127.0.0.1:8787/?code=AB12');
    expect(target.warnings).toEqual([expect.stringMatching(/PC selbst/)]);
  });

  it('ignoriert ungültige Overrides mit Warnung', () => {
    const target = resolveJoinTarget({
      ...base,
      env: { PUBLIC_HOST: 'http://evil', PUBLIC_PORT: 'abc' },
    });
    expect(target.source).toBe('auto');
    expect(target.joinUrl).toBe('http://192.168.178.42:8787/?code=AB12');
    expect(target.warnings).toHaveLength(2);
  });

  it('nimmt eine konkrete Bind-Adresse (HOST=…) direkt', () => {
    const target = resolveJoinTarget({ ...base, bindHost: '10.0.0.99' });
    expect(target.source).toBe('bind');
    expect(target.host).toBe('10.0.0.99');
    // Andere Adressen sind bei fester Bindung nicht erreichbar – keine Alternativen.
    expect(target.alternatives).toEqual([]);
    expect(
      resolveJoinTarget({ ...base, bindHost: '127.0.0.1', env: { PUBLIC_HOST: '127.0.0.1' } })
        .alternatives,
    ).toEqual([]);
  });

  it('warnt, wenn der Server nur auf Loopback lauscht', () => {
    const target = resolveJoinTarget({ ...base, bindHost: '127.0.0.1' });
    expect(target.warnings).toEqual([expect.stringMatching(/HOST=0\.0\.0\.0/)]);
  });

  it('nur Loopback/virtuell → localhost mit Warnung', () => {
    const target = resolveJoinTarget({
      ...base,
      interfaces: {
        lo: [v4('127.0.0.1', true)],
        docker0: [v4('172.17.0.1')],
      },
    });
    expect(target.source).toBe('fallback');
    expect(target.joinUrl).toBe('http://localhost:8787/?code=AB12');
    expect(target.warnings).toEqual([expect.stringMatching(/Keine LAN-Adresse/)]);
    expect(target.excluded.map((e) => e.interfaceName)).toEqual(['lo', 'docker0']);
  });

  it('berücksichtigt IPv6 nur, wenn der Server auf :: lauscht', () => {
    const interfaces: InterfaceTable = { en0: [v6('fd00::7')] };
    expect(resolveJoinTarget({ ...base, interfaces }).source).toBe('fallback');
    const target = resolveJoinTarget({ ...base, interfaces, bindHost: '::' });
    expect(target.joinUrl).toBe('http://[fd00::7]:8787/?code=AB12');
  });

  it('begrenzt die Zahl der Alternativen', () => {
    const interfaces: InterfaceTable = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`eth${String(i)}`, [v4(`192.168.${String(i)}.2`)]]),
    );
    const target = resolveJoinTarget({ ...base, interfaces, maxAlternatives: 3 });
    expect(target.alternatives).toHaveLength(3);
  });
});
