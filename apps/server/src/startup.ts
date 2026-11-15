/**
 * Startausgabe im Terminal (CHAOS-11): Wo öffne ich das Spiel am PC, welcher
 * Link/QR-Code gehört aufs Handy, welche anderen Adressen gibt es und wie wähle
 * ich eine andere aus. Rein, damit der Text testbar bleibt.
 */
import { renderUnicodeCompact } from 'uqr';
import type { JoinTarget } from './network.ts';
import type { LocalhostCheck } from './selfCheck.ts';

const SOURCE_TEXT: Record<JoinTarget['source'], string> = {
  env: 'aus PUBLIC_HOST',
  bind: 'aus HOST (Bind-Adresse)',
  auto: 'automatisch gewählt',
  fallback: 'Notlösung – nicht im WLAN erreichbar',
};

export interface StartupInfo {
  readonly listenPort: number;
  readonly joinCode: string;
  readonly target: JoinTarget;
  /** Ergebnis der Selbstprüfung (CHAOS-48); fehlt sie, gilt `localhost` als in Ordnung. */
  readonly localhost?: LocalhostCheck;
}

/**
 * Link zum PC-Spiel: normalerweise `localhost`. Antwortet dort ein fremdes Programm
 * (CHAOS-48), stattdessen die LAN-Adresse aus dem Join-Link – die erreicht sicher diesen Server.
 */
export function hostLink(listenPort: number, target: JoinTarget, localhostOk: boolean): string {
  if (localhostOk) return `http://localhost:${String(listenPort)}/host/`;
  return new URL('/host/', target.joinUrl).href;
}

export function formatStartupLines({
  listenPort,
  joinCode,
  target,
  localhost,
}: StartupInfo): string[] {
  const lines: string[] = [];
  const localhostOk = localhost?.ok ?? true;
  const best = target.candidates.find((c) => c.address === target.host);
  const why = best ? ` · ${best.interfaceName}: ${best.reasons.join(', ')}` : '';

  lines.push('Chaos Party läuft.');
  lines.push('');
  lines.push(`  Spiel am PC öffnen:   ${hostLink(listenPort, target, localhostOk)}`);
  lines.push(`  Join-Code:            ${joinCode}`);
  lines.push(`  Link für Handys (QR): ${target.joinUrl}`);
  lines.push(`                        (${SOURCE_TEXT[target.source]}${why})`);

  if (target.alternatives.length > 0) {
    lines.push('');
    lines.push('  Weitere Adressen dieses PCs (im Host per „Andere Adresse“ umschaltbar):');
    for (const url of target.alternatives) {
      const host = new URL(url).hostname;
      const candidate = target.candidates.find(
        (c) => c.address === host || `[${c.address}]` === host,
      );
      const label = candidate ? `  ${candidate.interfaceName}` : '';
      lines.push(`    ${url}${label}`);
    }
  }

  // Loopback und (bei IPv4-Server) IPv6 sind selbstverständlich; interessant sind
  // virtuelle Adapter und Link-Local – dort sucht man, wenn die Wahl falsch ist.
  const notable = target.excluded.filter((e) => e.kind === 'virtual' || e.kind === 'range');
  if (notable.length > 0) {
    lines.push('');
    lines.push('  Nicht verwendet:');
    for (const entry of notable) {
      lines.push(`    ${entry.interfaceName} ${entry.address} – ${entry.reason}`);
    }
  }

  if (!localhostOk) {
    const foreign = (localhost?.results ?? [])
      .filter((result) => result.status === 'foreign')
      .map((result) => new URL(result.url).host);
    lines.push('');
    lines.push(
      `  ⚠ Unter ${foreign.join(' und ')} antwortet ein anderes Programm, nicht Chaos Party.`,
    );
    lines.push(
      `    http://localhost:${String(listenPort)}/host/ führt deshalb ins Leere. Nutze den Link oben`,
    );
    lines.push(
      '    oder beende das andere Programm bzw. starte mit PORT=<anderer Port> pnpm start.',
    );
  }

  for (const warning of target.warnings) {
    lines.push('');
    lines.push(`  ⚠ ${warning}`);
  }

  lines.push('');
  lines.push(
    '  Andere Adresse erzwingen: PUBLIC_HOST=<IP oder Name> [PUBLIC_PORT=<Port>] pnpm start',
  );
  lines.push(
    '  Handy kommt nicht durch? Firewall, Gäste-WLAN/Client-Isolation: docs/network-setup.md',
  );
  return lines;
}

/** QR-Code des Join-Links als Unicode-Halbblöcke für das Terminal. */
export function renderTerminalQr(url: string): string {
  return renderUnicodeCompact(url, { border: 2 });
}
