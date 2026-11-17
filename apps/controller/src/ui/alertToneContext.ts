import { createContext, useContext } from 'react';
import type { AlertTone } from '../board/alertTone.ts';

/**
 * Hinweiston der Seite (CHAOS-122). `null` = ohne Ton (Tests, Vorschauen); `main.tsx`
 * stellt die Browser-Instanz bereit.
 */
export const AlertToneContext = createContext<AlertTone | null>(null);

export function useAlertTone(): AlertTone | null {
  return useContext(AlertToneContext);
}
