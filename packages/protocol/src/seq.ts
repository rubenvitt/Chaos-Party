/**
 * Schutz gegen veraltete und doppelte Eingaben (Annahme B8).
 *
 * Jede Controller-Verbindung zählt `seq` über alle ihre Slots hinweg streng
 * steigend. Der Server merkt sich pro Verbindung die letzte angenommene
 * Nummer und verwirft alles, was nicht größer ist (`stale-seq`). Lücken sind
 * erlaubt (verlorene oder verworfene Nachrichten). Eine neue Verbindung –
 * auch nach `reconnect` – beginnt mit einem neuen Wächter.
 */

/** Reine Prüfung: `seq` muss strikt größer als die zuletzt angenommene sein. */
export function acceptSeq(lastSeq: number | undefined, seq: number): boolean {
  if (!Number.isSafeInteger(seq) || seq < 0) return false;
  return lastSeq === undefined || seq > lastSeq;
}

export interface SeqGuard {
  /** Prüft `seq` und merkt sie sich bei Erfolg. */
  accept(seq: number): boolean;
  /** Zuletzt angenommene Nummer oder `undefined`. */
  readonly last: number | undefined;
}

export function createSeqGuard(): SeqGuard {
  let last: number | undefined;
  return {
    accept(seq) {
      if (!acceptSeq(last, seq)) return false;
      last = seq;
      return true;
    },
    get last() {
      return last;
    },
  };
}
