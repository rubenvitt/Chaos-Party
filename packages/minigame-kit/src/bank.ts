/**
 * Sichern/Riskieren-Konto (rein) für Zocken & Push-your-luck: Gesammeltes liegt erst im
 * Topf (ungesichert) und zählt nur, wenn es gesichert wird. Wer platzt, verliert den Topf
 * (ganz oder anteilig). Gewertet wird `banked` – oder `total`, wenn ein Spiel am Ende den
 * Topf mitzählt.
 */
import type { Slot } from '@chaos-party/minigame-sdk';

export interface BankAccount {
  /** Gesichert, zählt sicher. */
  banked: number;
  /** Im Topf, noch in Gefahr. */
  pot: number;
  /** Wie oft gesichert und wie oft geplatzt (Höhepunkte, Bots). */
  banks: number;
  busts: number;
  /** Größter je verlorener Topf. */
  biggestLoss: number;
}

export class RiskBank {
  private readonly accounts = new Map<Slot, BankAccount>();

  constructor(readonly slots: readonly Slot[]) {
    for (const slot of slots) {
      this.accounts.set(slot, { banked: 0, pot: 0, banks: 0, busts: 0, biggestLoss: 0 });
    }
  }

  account(slot: Slot): Readonly<BankAccount> | undefined {
    return this.accounts.get(slot);
  }

  /** In den Topf legen; liefert den neuen Topf. */
  add(slot: Slot, amount: number): number {
    const account = this.accounts.get(slot);
    if (!account) return 0;
    account.pot = Math.max(0, account.pot + amount);
    return account.pot;
  }

  /** Topf sichern; liefert den gesicherten Betrag (0, wenn der Topf leer war). */
  bank(slot: Slot): number {
    const account = this.accounts.get(slot);
    if (!account || account.pot <= 0) return 0;
    const amount = account.pot;
    account.banked += amount;
    account.pot = 0;
    account.banks++;
    return amount;
  }

  /** Platzen: `share` (0–1) des Topfs geht verloren; liefert den Verlust (ganzzahlig, abgerundet). */
  bust(slot: Slot, share = 1): number {
    const account = this.accounts.get(slot);
    if (!account) return 0;
    const loss = Math.floor(account.pot * Math.min(1, Math.max(0, share)));
    account.pot -= loss;
    account.busts++;
    account.biggestLoss = Math.max(account.biggestLoss, loss);
    return loss;
  }

  banked(slot: Slot): number {
    return this.accounts.get(slot)?.banked ?? 0;
  }

  pot(slot: Slot): number {
    return this.accounts.get(slot)?.pot ?? 0;
  }

  total(slot: Slot): number {
    return this.banked(slot) + this.pot(slot);
  }

  /** Punkte für die Wertung: nur Gesichertes oder (`includePot`) alles. */
  scores(includePot = false): { slot: Slot; score: number }[] {
    return this.slots.map((slot) => ({
      slot,
      score: includePot ? this.total(slot) : this.banked(slot),
    }));
  }
}
