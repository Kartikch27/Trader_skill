/**
 * Entry Watch, the rule from trader-entry/entry.py: the first COMPLETED bar
 * after the opening range that CLOSES above the level. A bar is complete
 * only once the clock passes its start + interval. A price above the level
 * inside a bar that is still forming is not a trigger.
 */
import type { Bar } from './types';
import { clock12 } from './format';
import { hhmmToMin, minToHhmm } from './market';

export type EntryStatus = 'not_open' | 'range_forming' | 'waiting' | 'triggered' | 'expired' | 'no_data';

export interface EntryWatchResult {
  status: EntryStatus;
  level: number | null;
  range: { high: number; low: number; bars: number; of: number } | null;
  lastClosed: { start: string; close: number; vsLevelPct: number | null } | null;
  forming: { start: string; closesAt: string } | null;
  trigger: { time: string; barStart: string; barIndex: number; price: number; overPct: number } | null;
  barsClosed: number;
}

export interface EntryWatchInput {
  bars: Bar[];           // the day's 5-minute bars, from 9:30
  nowMinutes: number;    // New York minutes since midnight
  orMinutes?: number;
  interval?: number;
  level?: number | null; // a level setup; otherwise the opening-range high
  noEntriesAfter?: string | null;
  open?: string;
  minVolumeX?: number | null;
}

const barStart = (b: Bar) => b.ny.slice(11, 16);

export function watchEntry(i: EntryWatchInput): EntryWatchResult {
  const interval = i.interval ?? 5;
  const orMin = i.orMinutes ?? 15;
  const openM = hhmmToMin(i.open ?? '09:30');
  const now = i.nowMinutes;
  const empty: EntryWatchResult = { status: 'no_data', level: null, range: null, lastClosed: null, forming: null, trigger: null, barsClosed: 0 };
  if (now < openM) return { ...empty, status: 'not_open' };
  if (!i.bars.length) return empty;

  const closed = i.bars.filter((b) => hhmmToMin(barStart(b)) + interval <= now);
  const formingBar = i.bars.find((b) => { const s = hhmmToMin(barStart(b)); return s <= now && now < s + interval; });
  const formingStart = formingBar ? barStart(formingBar) : (now < hhmmToMin('16:00') ? minToHhmm(Math.floor((now - openM) / interval) * interval + openM) : null);
  const forming = formingStart ? { start: formingStart, closesAt: clock12(minToHhmm(hhmmToMin(formingStart) + interval)) } : null;

  const nRange = orMin / interval;
  const rangeBars = closed.filter((b) => hhmmToMin(barStart(b)) < openM + orMin);
  if (rangeBars.length < nRange) {
    // a missing range bar after the range should have closed means a halt or thin data
    if (now >= openM + orMin + interval) return { ...empty, status: 'no_data', forming, barsClosed: closed.length };
    return { ...empty, status: 'range_forming', forming, barsClosed: closed.length, range: rangeBars.length ? { high: Math.max(...rangeBars.map((b) => b.h)), low: Math.min(...rangeBars.map((b) => b.l)), bars: rangeBars.length, of: nRange } : null };
  }
  const range = { high: Math.max(...rangeBars.map((b) => b.h)), low: Math.min(...rangeBars.map((b) => b.l)), bars: rangeBars.length, of: nRange };
  const level = i.level ?? range.high;
  const avgVol = rangeBars.reduce((a, b) => a + b.v, 0) / rangeBars.length;
  const after = closed.filter((b) => hhmmToMin(barStart(b)) >= openM + orMin);
  const cutoff = i.noEntriesAfter ? hhmmToMin(i.noEntriesAfter) : null;
  for (const b of after) {
    const closeAt = hhmmToMin(barStart(b)) + interval;
    if (cutoff != null && closeAt > cutoff) break;
    if (b.c > level + 1e-9 && (!i.minVolumeX || b.v >= i.minVolumeX * avgVol)) {
      const idx = i.bars.indexOf(b);
      return {
        status: 'triggered', level, range, forming, barsClosed: closed.length,
        lastClosed: { start: barStart(b), close: b.c, vsLevelPct: +(((b.c / level) - 1) * 100).toFixed(2) },
        trigger: { time: clock12(minToHhmm(closeAt)), barStart: barStart(b), barIndex: idx, price: b.c, overPct: +(((b.c / level) - 1) * 100).toFixed(2) },
      };
    }
  }
  const last = closed[closed.length - 1];
  const lastClosed = last ? { start: barStart(last), close: last.c, vsLevelPct: +(((last.c / level) - 1) * 100).toFixed(2) } : null;
  if (cutoff != null && now > cutoff) return { status: 'expired', level, range, lastClosed, forming: null, trigger: null, barsClosed: closed.length };
  // data must keep up with the clock: if the last closed bar is more than one bar behind, it is unavailable
  const expectedClosed = Math.floor((now - openM) / interval);
  if (closed.length < Math.min(expectedClosed, i.bars.length) || (expectedClosed > closed.length && closed.length === i.bars.length && now - (hhmmToMin(barStart(last)) + interval) > interval)) {
    return { status: 'no_data', level, range, lastClosed, forming, trigger: null, barsClosed: closed.length };
  }
  return { status: 'waiting', level, range, lastClosed, forming, trigger: null, barsClosed: closed.length };
}
