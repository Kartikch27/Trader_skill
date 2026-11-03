import { useEffect } from 'react';
import { create } from 'zustand';
import { useStore } from '../state/store';
import { useNow } from '../state/hooks';
import { checkAlerts } from '../domain/alerts';
import quotes from '../fixtures/quotes.json';
import type { Quote } from '../domain/types';

/** Not persisted on purpose: monitoring stops when the tab closes, and the UI says so. */
export const useMonitor = create<{ on: boolean; lastCheck: string | null; set: (on: boolean) => void; mark: (t: string) => void }>((set) => ({
  on: false, lastCheck: null, set: (on) => set({ on }), mark: (t) => set({ lastCheck: t }),
}));

export function runAlertCheck(now: ReturnType<typeof useNow>) {
  const s = useStore.getState();
  const fires = checkAlerts({ rules: s.alerts, fired: s.alertFired, quotes: quotes.quotes as Record<string, Quote>, now });
  if (fires.length) s.recordFires(fires);
  useMonitor.getState().mark(`${now.date} ${now.time}`);
  return fires;
}

export function AlertMonitor() {
  const on = useMonitor((m) => m.on);
  const now = useNow();
  useEffect(() => {
    if (!on) return;
    runAlertCheck(now);
    const id = setInterval(() => runAlertCheck(now), 30_000);
    return () => clearInterval(id);
  }, [on, now]);
  return null;
}
