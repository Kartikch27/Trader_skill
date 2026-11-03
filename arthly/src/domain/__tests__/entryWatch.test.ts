import { describe, expect, it } from 'vitest';
import { watchEntry } from '../entryWatch';
import { hhmmToMin } from '../market';
import bars from '../../fixtures/bars-TSLA.json';
import entry from '../../fixtures/entry-TSLA.json';
import type { Bar } from '../types';

const today = (bars.bars as Bar[]).filter((b) => b.ny.startsWith('2026-10-19'));
const at = (t: string) => watchEntry({ bars: today, nowMinutes: hhmmToMin(t), noEntriesAfter: '15:30' });

describe('entry watch (the rule from trader-entry/entry.py)', () => {
  it('before 9:30 the market is not open; before 9:45 the range is forming', () => {
    expect(at('09:10').status).toBe('not_open');
    expect(at('09:40').status).toBe('range_forming');
  });

  it('at 10:12 it waits: the 10:10 bar is still forming and does not count', () => {
    const r = at('10:12');
    expect(r.status).toBe('waiting');
    expect(r.range).toMatchObject({ high: entry.at_10_12.opening_range.high, low: entry.at_10_12.opening_range.low });
    expect(r.lastClosed).toMatchObject({ start: '10:05', close: entry.at_10_12.last.close, vsLevelPct: entry.at_10_12.last.vs_level_pct });
    expect(r.forming).toMatchObject({ start: '10:10', closesAt: '10:15 AM' });
  });

  it('at 10:15 it triggers on the 10:10 bar close, like entry.py', () => {
    const r = at('10:15');
    expect(r.status).toBe('triggered');
    expect(r.trigger).toMatchObject({ time: entry.at_10_15.time, barStart: entry.at_10_15.bar_start, price: entry.at_10_15.price });
  });

  it('a volume filter can delay the trigger past the bars available', () => {
    const r = watchEntry({ bars: today, nowMinutes: hhmmToMin('10:15'), minVolumeX: 1 });
    expect(r.status).not.toBe('triggered');
  });

  it('no bars means data unavailable', () => {
    expect(watchEntry({ bars: [], nowMinutes: hhmmToMin('10:15') }).status).toBe('no_data');
  });
});
