import { describe, expect, it } from 'vitest';
import { bracketOrder, sharesFor, sizeTrade } from '../sizing';
import config from '../../fixtures/config.example.json';
import sizingFx from '../../fixtures/sizing-TSLA.json';

const cfg = { ...config, blocked: [] as string[] };

describe('position sizing (port of trader-budget/size.py)', () => {
  it('the illustrative example: $5,000 cash, $50 risk, entry 100, stop 98, target 104 -> 25 shares', () => {
    const s = sizeTrade({ symbol: 'DEMO', entry: 100, stop: 98, target: 104, config: { ...cfg, budget: 5000, max_loss_per_trade_usd: 50 } });
    expect(s.refusal).toBeNull();
    expect(s.risk_per_share).toBe(2);
    expect(s.qty).toBe(25);
    expect(s.bound_by).toBe('max loss');
    expect(s.cost).toBe(2500);
    expect(s.max_loss).toBe(50);
    expect(s.potential_gain).toBe(100);
    expect(s.reward_risk).toBe(2);
    expect(s.limits.map((l) => [l.name, l.shares])).toEqual([['max loss', 25], ['position cap', 37], ['max order', 40], ['cash', 45]]);
  });

  it('matches size.py on the reel TSLA plan (8 shares, $2,913.44, $46.88 at the stop)', () => {
    const want = sizingFx.sizing;
    const s = sizeTrade({ symbol: 'TSLA', entry: 364.18, stop: 358.32, target: 370.04, config: cfg });
    expect(s.qty).toBe(want.qty);
    expect(s.cost).toBe(want.cost);
    expect(s.max_loss).toBe(want.max_loss);
    expect(s.cash_available).toBe(want.cash_available);
    expect(s.limits.map((l) => l.shares)).toEqual(want.limits.map((l) => l.shares));
    expect(s.limits.map((l) => l.how)).toEqual(want.limits.map((l) => l.how));
  });

  it('writes the same bracket order fields as size.py', () => {
    const s = sizeTrade({ symbol: 'TSLA', entry: 364.18, stop: 358.32, target: 370.04, config: cfg });
    const o = bracketOrder(s, { setup: 'orb', entry_time: '10:15 AM', flat_by: '15:55', max_loss_per_trade_usd: 50 });
    expect(o).toEqual(sizingFx.orders[0]);
  });

  it('refuses when one share risks more than the max loss (stop 300)', () => {
    const s = sizeTrade({ symbol: 'TSLA', entry: 364.18, stop: 300, target: 500, config: cfg });
    expect(s.qty).toBe(0);
    expect(s.refusal_code).toBe('zero_max_loss');
  });

  it('a fresh higher price means a bigger risk and fewer shares; reward:risk 0.44 is refused', () => {
    const s = sizeTrade({ symbol: 'TSLA', entry: 364.18, stop: 358.32, target: 370.04, freshPrice: 366.48, config: cfg });
    expect(s.entry).toBe(366.48);
    expect(s.entry_from).toBe('price');
    expect(s.qty).toBe(6);
    expect(s.reward_risk).toBe(0.44);
    expect(s.refusal_code).toBe('reward_risk');
  });

  it('a lower fresh price never shrinks the risk', () => {
    const s = sizeTrade({ symbol: 'TSLA', entry: 364.18, stop: 358.32, target: 370.04, freshPrice: 360, config: cfg });
    expect(s.entry).toBe(364.18);
  });

  it('cash in the account caps the size', () => {
    const s = sizeTrade({ symbol: 'DEMO', entry: 100, stop: 98, target: 104, cash: 1500, config: { ...cfg, budget: 5000 } });
    expect(s.cash_available).toBe(1000);
    expect(s.qty).toBe(10);
    expect(s.bound_by).toBe('cash');
  });

  it('refuses blocked tickers, stops at or above the entry and targets at or below it', () => {
    expect(sizeTrade({ symbol: 'tsla', entry: 10, stop: 9, target: 12, config: { ...cfg, blocked: ['TSLA'] } }).refusal_code).toBe('blocked');
    expect(sizeTrade({ symbol: 'X', entry: 10, stop: 10, target: 12, config: cfg }).refusal_code).toBe('stop_not_below');
    expect(sizeTrade({ symbol: 'X', entry: 10, stop: 9, target: 10, config: cfg }).refusal_code).toBe('target_not_above');
  });

  it('whole shares in exact cents', () => {
    expect(sharesFor(50, 5.86)).toBe(8);
    expect(sharesFor(0.3, 0.1)).toBe(3);
    expect(sharesFor(10, 0)).toBe(0);
  });
});
