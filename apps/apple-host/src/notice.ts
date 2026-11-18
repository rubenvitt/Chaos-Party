/**
 * Große Einblendung des Apple-Hosts (CHAOS-157): wie `.board-notice` im Browser-Host
 * („Sabotage wird stärker!“ aus `eventNotice`, CHAOS-120), `NOTICE_MS` lang sichtbar.
 * Die Lebensdauer läuft hier im Kern, damit Swift nur zeichnet, was `renderState` liefert.
 */
import type { BoardEvent } from '@chaos-party/protocol';
import { eventNotice, type NoticeText } from '../../host/src/board/texts.ts';

/** Wie `NOTICE_MS` in `apps/host/src/board/director.ts`. */
export const NOTICE_MS = 4000;

export interface NoticeTracker {
  /** Neues Brett-Ereignis zum Zeitpunkt `now` (ms). Eine neue Einblendung ersetzt die alte. */
  push(event: BoardEvent, now: number): void;
  /** Sichtbare Einblendung zum Zeitpunkt `now` oder `null`. */
  current(now: number): NoticeText | null;
  clear(): void;
}

export function createNoticeTracker(): NoticeTracker {
  let active: { notice: NoticeText; until: number } | null = null;
  return {
    push(event, now) {
      const notice = eventNotice(event);
      if (notice) active = { notice, until: now + NOTICE_MS };
    },
    current(now) {
      if (active && now >= active.until) active = null;
      return active ? { title: active.notice.title, detail: active.notice.detail } : null;
    },
    clear() {
      active = null;
    },
  };
}
