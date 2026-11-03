import { describe, expect, it } from 'vitest';
import { atrOf, computeExit } from '../exitPlan';
import plan from '../../fixtures/plan-TSLA.json';

const range = { high: 362.18, low: 354.47, minutes: 15 };

describe('exit plan (port of trader-exit/exit.py compute)', () => {
  it('matches exit.py on the reel: midpoint stop rounded down, 1R target', () => {
    const r = computeExit({ entry: 364.18, stopRule: 'or_mid', targetRule: 'r', targetValue: 1, openingRange: range });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.stop).toBe(plan.stop);
    expect(r.plan.target).toBe(plan.target);
    expect(r.plan.riskPerShare).toBe(plan.risk_per_share);
    expect(r.plan.rewardRisk).toBe(plan.reward_risk);
    expect(r.plan.stopDetail).toBe(plan.stop_detail);
    expect(r.plan.targetLabel).toBe(plan.target_label);
  });

  it('the default 2R target is 375.90', () => {
    const r = computeExit({ entry: 364.18, stopRule: 'or_mid', targetRule: 'r', targetValue: 2, openingRange: range });
    expect(r.ok && r.plan.target).toBe(375.9);
  });

  it('percent stop and price target: 100 / 98 / 104 is 2:1', () => {
    const r = computeExit({ entry: 100, stopRule: 'pct', stopValue: 2, targetRule: 'price', targetValue: 104 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.stop).toBe(98);
    expect(r.plan.riskPerShare).toBe(2);
    expect(r.plan.rewardPerShare).toBe(4);
    expect(r.plan.rewardRisk).toBe(2);
  });

  it('refuses a stop at or above the entry, a target at or below it, and a stop too tight for the spread', () => {
    expect(computeExit({ entry: 100, stopRule: 'price', stopValue: 100, targetRule: 'r', targetValue: 2 })).toMatchObject({ ok: false, error: { code: 'stop_at_or_above_entry' } });
    expect(computeExit({ entry: 100, stopRule: 'price', stopValue: 99, targetRule: 'price', targetValue: 100 })).toMatchObject({ ok: false, error: { code: 'target_at_or_below_entry' } });
    expect(computeExit({ entry: 364.18, stopRule: 'price', stopValue: 364.1, targetRule: 'r', targetValue: 2 })).toMatchObject({ ok: false, error: { code: 'too_tight' } });
  });

  it('refuses an entry at or after the flat-by time', () => {
    expect(computeExit({ entry: 10, stopRule: 'price', stopValue: 9, targetRule: 'r', targetValue: 1, entryTime: '15:55', flatBy: '15:55' })).toMatchObject({ ok: false, error: { code: 'entry_after_flat_by' } });
  });

  it('an opening-range stop needs the range', () => {
    expect(computeExit({ entry: 10, stopRule: 'or_low', targetRule: 'r', targetValue: 1 })).toMatchObject({ ok: false, error: { code: 'needs_range' } });
  });

  it('ATR uses true range and averages what it has when fewer than 14 bars', () => {
    const a = atrOf([{ h: 11, l: 10, c: 10.5 }, { h: 12, l: 11, c: 11.5 }]);
    expect(a.bars).toBe(2);
    expect(a.value).toBeCloseTo((1 + 1.5) / 2);
  });
});
