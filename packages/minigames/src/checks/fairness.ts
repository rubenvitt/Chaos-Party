/**
 * Bot-Fairness-Vorlage für alle Minispiele (CHAOS-84, README §5.2): feste Tische, gleiche
 * Kennzahlen wie EXP-005/007/016/023 und **feste Schwellen**, die für jedes Spiel gelten.
 *
 * Ein Spiel liefert nur einen `FairnessHarness` (Bots für die drei Können-Stufen und ein paar
 * abweichende Strategien, mindestens „Dauerdrücken“). Tische, Kennzahlen, Schwellen und der
 * Bericht kommen von hier. Rein, ohne Babylon (die Harnesses dürfen Havok headless nutzen).
 *
 * Die Bots sind Annahmen über Couch-Spieler, nicht gemessen. Die Prüfung findet unfaire oder
 * entschiedene Spiele, sie beweist keinen Spaß.
 */

/** Können-Stufe eines Bot-Sitzes. */
export type FairnessSkill = 'profi' | 'normal' | 'neuling';

/** Ein Sitz am Tisch: Können und optional eine abweichende Strategie (Eindringling). */
export interface FairnessSeat {
  readonly skill: FairnessSkill;
  /** Kennung aus `FairnessHarness.intruders`; ohne = normale Spielweise. */
  readonly strategy?: string;
}

/** Ergebnis einer Bot-Partie. Index = Sitz = Slot − 1. */
export interface FairnessMatch {
  readonly scores: readonly number[];
  /** Wechsel der **alleinigen** Führung während der Partie (Gleichstand zählt nicht). */
  readonly leadChanges: number;
}

export interface FairnessIntruder {
  readonly id: string;
  readonly label: string;
}

/** Was ein Minispiel für die Fairness-Prüfung mitbringt. */
export interface FairnessHarness {
  readonly id: string;
  readonly scoring: 'higher' | 'lower';
  /**
   * Abweichende Strategien für den Eindringling-Test. Die erste ist **Dauerdrücken** (stur
   * den Hauptknopf hämmern bzw. Stick fest + Knopf), die übrigen spielbezogene Störer.
   */
  readonly intruders: readonly FairnessIntruder[];
  /**
   * Seeds je Tisch in der CI-Stichprobe. Reine Logik verträgt 60, Havok-Spiele weniger
   * (Laufzeitziel < 10 s je Spiel). Der volle Bericht nutzt `FAIRNESS_SEEDS`.
   */
  readonly ciSeeds: number;
  /** Begründete Ausnahmen von Schwellen (Text auch im Katalog-Eintrag). */
  readonly exceptions?: readonly FairnessException[];
  play(seats: readonly FairnessSeat[], seed: number): FairnessMatch | Promise<FairnessMatch>;
}

/** Kennzahlen eines Spiels über alle Tische. */
export interface FairnessReport {
  readonly id: string;
  readonly seeds: number;
  /** Tisch 4× Normal: Anteil Partien mit geteiltem 1. Platz. */
  readonly tieForFirst: number;
  /** Tisch 4× Normal: mittlerer relativer Abstand Platz 1–2 (0 = knapp, 1 = einseitig). */
  readonly gap12: number;
  /** Tisch 4× Normal: Führungswechsel je Partie. */
  readonly leadChanges: number;
  /** Neuling gegen 3× Normal (Platz reihum): Siegquote, geteilte Siege anteilig. Fair: 25 %. */
  readonly noviceWins: number;
  /** Profi gegen 3× Normal (Platz reihum): Siegquote. Fair: 25 %. */
  readonly proWins: number;
  /** Eindringling gegen 2× Normal (3 Sp., Platz reihum): Siegfaktor = Quote × 3 (1 = fair). */
  readonly intruders: readonly {
    readonly id: string;
    readonly label: string;
    readonly factor: number;
  }[];
  /** Rechenzeit der Messung in ms (für das Laufzeitziel). */
  readonly ms: number;
}

/**
 * Feste Schwellen für alle Minispiele. Begründung je Wert in `docs/minigames/pruefungen.md`;
 * kurz: Sie trennen die angenommenen Spiele (Sockenregen, Pudding-Gerangel, Wackelturm,
 * Kuckucks-Klatsche K2, Krümel-Kehraus R3) von den verworfenen Konzepten (EXP-005 B1/B2/C1,
 * EXP-006 B, EXP-007 B2) mit Abstand zum Rauschen der Stichprobe.
 */
export const FAIRNESS_THRESHOLDS = {
  /** Höchstens jede vierte Partie unter Gleichstarken endet mit geteiltem Sieg. */
  maxTieForFirst: 0.25,
  /** Platz 1 liegt im Mittel höchstens 45 % vor Platz 2 (verworfen: B1 67–98 %). */
  maxGap12: 0.45,
  /** Mindestens ein Führungswechsel je Partie (verworfen: B1/B2/C1 0,0–0,9). */
  minLeadChanges: 1,
  /** Ein Neuling gewinnt gegen drei Normale wenigstens manchmal (verworfen: 0 %). */
  minNoviceWins: 0.02,
  /** … aber nicht öfter als fair: Können muss zählen (EXP-007 A4: Außenseiter > fair). */
  maxNoviceWins: 0.25,
  /** Ein Profi gewinnt gegen drei Normale mindestens den fairen Anteil. */
  minProWins: 0.25,
  /** Keine Strategie schlägt die normale Spielweise deutlich (dominant: EXP-007 B2 ≥ 1,97). */
  maxIntruderFactor: 1.5,
} as const;

export type FairnessThresholds = typeof FAIRNESS_THRESHOLDS;

/** Begründete Ausnahme eines Spiels von einer Schwelle (nur mit Text im Katalog-Eintrag). */
export interface FairnessException {
  readonly metric: keyof FairnessThresholds;
  readonly value: number;
  readonly reason: string;
}

const PLAYERS_MAIN = 4;
const PLAYERS_INTRUDER = 3;

function winnersOf(scores: readonly number[], scoring: 'higher' | 'lower'): number[] {
  const rounded = scores.map((score) => Math.round(score));
  const best = scoring === 'higher' ? Math.max(...rounded) : Math.min(...rounded);
  return rounded.flatMap((score, index) => (score === best ? [index] : []));
}

/** Siegquote eines Sitzes in einer Partie; geteilte Siege anteilig. */
export function winShare(match: FairnessMatch, seat: number, scoring: 'higher' | 'lower'): number {
  const winners = winnersOf(match.scores, scoring);
  return winners.includes(seat) ? 1 / winners.length : 0;
}

/** Relativer Abstand Platz 1–2 einer Partie (0 bei Gleichstand, 1 bei 0 Punkten für Platz 2). */
export function relativeGap(scores: readonly number[], scoring: 'higher' | 'lower'): number {
  const sorted = scores
    .map((score) => Math.round(score))
    .sort((a, b) => (scoring === 'higher' ? b - a : a - b));
  const first = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  const scale = Math.max(Math.abs(first), Math.abs(second));
  return scale > 0 ? Math.abs(first - second) / scale : 0;
}

/**
 * Zählt Wechsel der alleinigen Führung aus einer Punktfolge (für Harnesses, die nur Punkte
 * sehen). Gleichstand und „alle 0“ setzen keinen Führenden.
 */
export class LeadCounter {
  private leader: number | null = null;
  changes = 0;

  constructor(private readonly scoring: 'higher' | 'lower' = 'higher') {}

  update(scores: readonly number[]): void {
    const winners = winnersOf(scores, this.scoring);
    if (winners.length !== 1 || scores.every((score) => Math.round(score) === 0)) return;
    const current = winners[0] ?? null;
    if (current !== this.leader) {
      if (this.leader !== null) this.changes++;
      this.leader = current;
    }
  }
}

const normal: FairnessSeat = { skill: 'normal' };

/** Misst alle Tische mit Seeds `1 … seeds`. */
export async function measureFairness(
  harness: FairnessHarness,
  seeds: number = harness.ciSeeds,
): Promise<FairnessReport> {
  const started = performance.now();
  const list = Array.from({ length: seeds }, (_, index) => index + 1);
  const { scoring } = harness;

  let ties = 0;
  let gap = 0;
  let leadChanges = 0;
  for (const seed of list) {
    const match = await harness.play(
      Array.from({ length: PLAYERS_MAIN }, () => normal),
      seed,
    );
    if (winnersOf(match.scores, scoring).length > 1) ties++;
    gap += relativeGap(match.scores, scoring);
    leadChanges += match.leadChanges;
  }

  const oddOneOut = async (seat: FairnessSeat, players: number): Promise<number> => {
    let share = 0;
    for (const seed of list) {
      const index = (seed - 1) % players;
      const seats = Array.from({ length: players }, (_, i) => (i === index ? seat : normal));
      share += winShare(await harness.play(seats, seed), index, scoring);
    }
    return share / list.length;
  };

  const noviceWins = await oddOneOut({ skill: 'neuling' }, PLAYERS_MAIN);
  const proWins = await oddOneOut({ skill: 'profi' }, PLAYERS_MAIN);
  const intruders = [];
  for (const intruder of harness.intruders) {
    const share = await oddOneOut({ skill: 'normal', strategy: intruder.id }, PLAYERS_INTRUDER);
    intruders.push({ id: intruder.id, label: intruder.label, factor: share * PLAYERS_INTRUDER });
  }

  return {
    id: harness.id,
    seeds,
    tieForFirst: ties / seeds,
    gap12: gap / seeds,
    leadChanges: leadChanges / seeds,
    noviceWins,
    proWins,
    intruders,
    ms: performance.now() - started,
  };
}

export interface FairnessViolation {
  readonly metric: keyof FairnessThresholds;
  readonly value: number;
  readonly limit: number;
  readonly text: string;
}

/**
 * 95-%-Vertrauensbereich einer Quote nach Wilson. Kleine Stichproben (Havok-Spiele in CI)
 * melden damit nur Verstöße, die trotz Rauschen eindeutig sind.
 */
export function wilsonInterval(share: number, n: number, z = 1.96): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const z2 = z * z;
  const center = (share + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z / (1 + z2 / n)) * Math.sqrt((share * (1 - share)) / n + z2 / (4 * n * n));
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/**
 * Verstöße gegen die Schwellen, ohne begründete Ausnahmen. Quoten (Gleichstand, Siege,
 * Eindringling) gelten erst als verletzt, wenn ihr ganzer 95-%-Bereich jenseits der Schwelle
 * liegt; Mittelwerte (Abstand, Führungswechsel) werden direkt verglichen.
 */
export function checkFairness(
  report: FairnessReport,
  exceptions: readonly FairnessException[] = [],
  thresholds: FairnessThresholds = FAIRNESS_THRESHOLDS,
): FairnessViolation[] {
  const violations: FairnessViolation[] = [];
  const add = (metric: keyof FairnessThresholds, value: number, limit: number, text: string) => {
    if (exceptions.some((exception) => exception.metric === metric)) return;
    violations.push({ metric, value, limit, text });
  };
  const t = thresholds;
  const n = report.seeds;
  const above = (share: number, limit: number) => wilsonInterval(share, n).low > limit;
  const below = (share: number, limit: number) => wilsonInterval(share, n).high < limit;
  if (above(report.tieForFirst, t.maxTieForFirst)) {
    add('maxTieForFirst', report.tieForFirst, t.maxTieForFirst, 'zu viele geteilte Siege');
  }
  if (report.gap12 > t.maxGap12) add('maxGap12', report.gap12, t.maxGap12, 'zu einseitig');
  if (report.leadChanges < t.minLeadChanges) {
    add('minLeadChanges', report.leadChanges, t.minLeadChanges, 'zu früh entschieden');
  }
  if (below(report.noviceWins, t.minNoviceWins)) {
    add('minNoviceWins', report.noviceWins, t.minNoviceWins, 'Neuling chancenlos');
  }
  if (above(report.noviceWins, t.maxNoviceWins)) {
    add('maxNoviceWins', report.noviceWins, t.maxNoviceWins, 'Können zählt nicht');
  }
  if (below(report.proWins, t.minProWins)) {
    add('minProWins', report.proWins, t.minProWins, 'Profi unter fairem Anteil');
  }
  for (const intruder of report.intruders) {
    if (above(intruder.factor / PLAYERS_INTRUDER, t.maxIntruderFactor / PLAYERS_INTRUDER)) {
      add(
        'maxIntruderFactor',
        intruder.factor,
        t.maxIntruderFactor,
        `„${intruder.label}“ ist dominant`,
      );
    }
  }
  return violations;
}

const pct = (value: number) => `${Math.round(value * 100)} %`;
const num = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');

/** Bericht als Markdown-Tabelle (eine Zeile je Spiel, für Katalog und Prüfbericht). */
export function fairnessTable(reports: readonly FairnessReport[]): string {
  const t = FAIRNESS_THRESHOLDS;
  const headers = [
    'Spiel',
    'Seeds',
    `Gleichstand P1 (≤ ${pct(t.maxTieForFirst)})`,
    `Abstand 1–2 (≤ ${pct(t.maxGap12)})`,
    `Führungswechsel (≥ ${num(t.minLeadChanges)})`,
    `Siege Neuling (${pct(t.minNoviceWins)}–${pct(t.maxNoviceWins)})`,
    `Siege Profi (≥ ${pct(t.minProWins)})`,
    `Eindringling max. (≤ ${num(t.maxIntruderFactor, 2)})`,
    'Rechenzeit s',
  ];
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  const rows = reports.map((report) => {
    const worst = [...report.intruders].sort((a, b) => b.factor - a.factor)[0];
    return line([
      report.id,
      String(report.seeds),
      pct(report.tieForFirst),
      pct(report.gap12),
      num(report.leadChanges),
      pct(report.noviceWins),
      pct(report.proWins),
      worst ? `${num(worst.factor, 2)} (${worst.label})` : '–',
      num(report.ms / 1000),
    ]);
  });
  return [line(headers), line(headers.map(() => '---')), ...rows].join('\n');
}

/** Eindringling-Faktoren je Strategie (Detailtabelle für den Bericht). */
export function intruderTable(reports: readonly FairnessReport[]): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  const rows = reports.flatMap((report) =>
    report.intruders.map((intruder) => line([report.id, intruder.label, num(intruder.factor, 2)])),
  );
  return [line(['Spiel', 'Strategie', 'Siegfaktor']), line(['---', '---', '---']), ...rows].join(
    '\n',
  );
}
