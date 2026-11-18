import { describe, expect, it } from 'vitest';
import { NOTICE_MS, createNoticeTracker } from '../src/notice.ts';

const GROWTH = { type: 'round-started', round: 6, sabotage: { steal: 6, trap: 5 } } as const;
const SABOTAGE = { title: 'Sabotage wird stärker!', detail: 'Klau: 6 Münzen · Falle: 5 Münzen' };

describe('Einblendung im Apple-Host (CHAOS-157)', () => {
  it('zeigt „Sabotage wird stärker!“ in einer Wachstumsrunde für NOTICE_MS', () => {
    const notices = createNoticeTracker();
    notices.push(GROWTH, 1000);
    expect(notices.current(1000)).toEqual(SABOTAGE);
    expect(notices.current(1000 + NOTICE_MS - 1)).toEqual(SABOTAGE);
    expect(notices.current(1000 + NOTICE_MS)).toBeNull();
  });

  it('zeigt nichts ohne wachsende Sabotage (auch bei sabotageGrowthRounds: 0)', () => {
    const notices = createNoticeTracker();
    notices.push({ type: 'round-started', round: 6 }, 0);
    notices.push({ type: 'turn-started', slot: 1, round: 6 }, 0);
    expect(notices.current(0)).toBeNull();
  });

  it('wird von anderen Ereignissen nicht verdrängt und lässt sich leeren', () => {
    const notices = createNoticeTracker();
    notices.push(GROWTH, 0);
    notices.push({ type: 'turn-started', slot: 1, round: 6 }, 100);
    expect(notices.current(200)).toEqual(SABOTAGE);
    notices.clear();
    expect(notices.current(200)).toBeNull();
  });
});
