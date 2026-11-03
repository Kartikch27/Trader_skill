import { describe, expect, it } from 'vitest';
import { approvalBlocker, approve, cancel, fill, propose, recordCheck, reject, revise, submit, OrderStateError } from '../orderState';
import { checkOrder, type RiskContext } from '../risk';
import { toNy, demoInstant } from '../market';
import config from '../../fixtures/config.example.json';
import sizing from '../../fixtures/sizing-TSLA.json';
import type { Config, ProposedOrder } from '../types';

const order = sizing.orders[0] as ProposedOrder;
const ctx = (hhmm = '10:15'): RiskContext => ({
  config: config as Config, now: toNy(demoInstant(hhmm)), cash: 5000, holdings: {}, entriesToday: [], ordersToday: 0,
});
const TODAY = '2026-10-19';

describe('order state transitions', () => {
  it('proposed -> checked -> approved -> submitted -> filled', () => {
    let r = propose('o1', order, 1);
    expect(r.state).toBe('proposed');
    expect(approvalBlocker(r, TODAY)).toBe('not_checked');
    r = recordCheck(r, checkOrder(order, ctx()));
    expect(r.state).toBe('checked');
    expect(approvalBlocker(r, TODAY)).toBeNull();
    r = approve(r, TODAY);
    expect(r.approval?.fingerprint).toBe(r.fingerprint);
    r = submit(r, 'demo-1');
    r = fill(r, 8, 364.2);
    expect(r.state).toBe('filled');
    expect(r.filledQty).toBe(8);
    expect(r.history.map((h) => h.state)).toEqual(['proposed', 'checked', 'approved', 'submitted', 'filled']);
  });

  it('partial fills average the price', () => {
    let r = submit(approve(recordCheck(propose('o1', order, 1), checkOrder(order, ctx())), TODAY), 'x');
    r = fill(r, 3, 364);
    expect(r.state).toBe('partially_filled');
    r = fill(r, 5, 365);
    expect(r.state).toBe('filled');
    expect(r.avgFillPrice).toBe(364.63);
  });

  it('a blocked order cannot be approved (9 shares is over the $50 max loss)', () => {
    const nine = { ...order, qty: '9' };
    const r = recordCheck(propose('o1', nine, 1), checkOrder(nine, ctx()));
    expect(r.state).toBe('blocked');
    expect(() => approve(r, TODAY)).toThrow(OrderStateError);
  });

  it('a check outside the entry window blocks (9:40 is before 9:45)', () => {
    const r = recordCheck(propose('o1', order, 1), checkOrder(order, ctx('09:40')));
    expect(r.state).toBe('blocked');
    expect(r.check?.checks.find((c) => c.id === 'window')?.status).toBe('block');
  });

  it('a check for a different version of the order is refused', () => {
    const r = propose('o1', order, 1);
    expect(() => recordCheck(r, checkOrder({ ...order, qty: '7' }, ctx()))).toThrow(OrderStateError);
  });

  it("yesterday's check does not count today", () => {
    const r = recordCheck(propose('o1', order, 1), checkOrder(order, ctx()));
    expect(approvalBlocker(r, '2026-10-20')).toBe('check_not_today');
  });

  it('changing the order supersedes the old version and drops its check and approval', () => {
    const approved = approve(recordCheck(propose('o1', order, 1), checkOrder(order, ctx())), TODAY);
    const [old, next] = revise(approved, { ...order, qty: '7' }, 2, 'o2');
    expect(old.state).toBe('superseded');
    expect(next).not.toBeNull();
    expect(next!.state).toBe('proposed');
    expect(next!.check).toBeUndefined();
    expect(next!.approval).toBeUndefined();
    expect(next!.version).toBe(2);
    expect(() => submit(old, 'x')).toThrow(OrderStateError);
  });

  it('the same order and plan is not a revision', () => {
    const r = propose('o1', order, 1);
    expect(revise(r, { ...order }, 1, 'o2')[1]).toBeNull();
  });

  it('cannot submit without an approval, and terminal states are final', () => {
    const checked = recordCheck(propose('o1', order, 1), checkOrder(order, ctx()));
    expect(() => submit(checked, 'x')).toThrow(OrderStateError);
    const rej = reject(submit(approve(checked, TODAY), 'x'), 'insufficient buying power');
    expect(rej.state).toBe('rejected');
    expect(() => cancel(rej)).toThrow(OrderStateError);
  });
});

describe('rules check preview (port of trader-risk/check.py)', () => {
  it('passes the reel order with the same numbers check.py printed', () => {
    const rep = checkOrder(order, ctx());
    expect(rep.verdict).toBe('PASS');
    expect(rep.max_loss).toBe(46.88);
    expect(rep.reward_risk).toBe(1);
    expect(rep.value_usd).toBe(2913.44);
    expect(rep.fingerprint).toBe('c38dc9bf3e621b26');
  });

  it('a fresh 366.48 price blocks twice: $65.28 at the stop and reward:risk 0.44', () => {
    const rep = checkOrder(order, { ...ctx('10:55'), freshPrice: 366.48 });
    expect(rep.verdict).toBe('BLOCK');
    expect(rep.max_loss).toBe(65.28);
    expect(rep.checks.find((c) => c.id === 'loss')?.status).toBe('block');
    expect(rep.checks.find((c) => c.id === 'reward_risk')?.status).toBe('block');
  });

  it('a sell that only closes what you hold is never blocked by day limits or the window', () => {
    const sell: ProposedOrder = { symbol: 'TSLA', side: 'sell', qty: '8', type: 'market', time_in_force: 'day' };
    const rep = checkOrder(sell, { ...ctx('15:55'), cash: 2086.56, holdings: { TSLA: { qty: 8, value: 2913.6 } }, entriesToday: [{ symbol: 'TSLA', side: 'buy', maxLoss: 46.88 }, { symbol: 'X', side: 'buy', maxLoss: 50 }, { symbol: 'Y', side: 'buy', maxLoss: 50 }] });
    expect(rep.kind).toBe('exit');
    expect(rep.verdict).toBe('PASS');
  });

  it('the daily loss limit counts what is already at risk today', () => {
    const rep = checkOrder(order, { ...ctx(), entriesToday: [{ symbol: 'A', side: 'buy', maxLoss: 50 }, { symbol: 'B', side: 'buy', maxLoss: 60 }] });
    expect(rep.checks.find((c) => c.id === 'daily_loss')?.status).toBe('block');
  });

  it('a short sale is blocked while allow_short is false', () => {
    const rep = checkOrder({ symbol: 'TSLA', side: 'sell', qty: '5', type: 'market', time_in_force: 'day' }, ctx());
    expect(rep.checks.find((c) => c.id === 'short')?.status).toBe('block');
  });
});
