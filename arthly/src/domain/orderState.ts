/**
 * Order lifecycle. Mirrors trader-broker's gates: an order can be approved
 * only after a PASS for its exact fingerprint on the same New York date, and
 * only an approved order can be submitted. Editing an order (a new
 * fingerprint) supersedes the old version, which drops its check and approval.
 * An entry trigger is never an order: orders start as `proposed`.
 */
import type { OrderEvent, OrderRecord, OrderState, ProposedOrder, RiskReport } from './types';
import { fingerprint } from './fingerprint';

export const TRANSITIONS: Record<OrderState, OrderState[]> = {
  proposed: ['checked', 'blocked', 'superseded', 'cancelled'],
  checked: ['approved', 'checked', 'blocked', 'superseded', 'cancelled'],
  blocked: ['checked', 'blocked', 'superseded', 'cancelled'],
  approved: ['submitted', 'superseded', 'cancelled'],
  submitted: ['partially_filled', 'filled', 'rejected', 'cancelled'],
  partially_filled: ['partially_filled', 'filled', 'cancelled'],
  filled: [],
  rejected: [],
  cancelled: [],
  superseded: [],
};

export const TERMINAL: OrderState[] = ['filled', 'rejected', 'cancelled', 'superseded'];
export const AT_BROKER: OrderState[] = ['submitted', 'partially_filled', 'filled', 'rejected'];

export class OrderStateError extends Error {}

const ev = (state: OrderState, note: string, at = new Date().toISOString()): OrderEvent => ({ at, state, note });

function move(r: OrderRecord, to: OrderState, note: string, patch: Partial<OrderRecord> = {}, at?: string): OrderRecord {
  if (!TRANSITIONS[r.state].includes(to)) throw new OrderStateError(`cannot go from ${r.state} to ${to}`);
  return { ...r, ...patch, state: to, history: [...r.history, ev(to, note, at)] };
}

export function propose(id: string, order: ProposedOrder, planVersion: number, version = 1, at?: string): OrderRecord {
  return {
    id, version, planVersion, account: 'paper', broker: 'demo', order,
    fingerprint: fingerprint(order as unknown as Record<string, unknown>), state: 'proposed',
    filledQty: 0, history: [ev('proposed', `v${version} proposed from plan v${planVersion}`, at)],
  };
}

/** Record a rules check. It must be for this exact order. */
export function recordCheck(r: OrderRecord, report: RiskReport, at?: string): OrderRecord {
  if (report.fingerprint !== r.fingerprint) throw new OrderStateError('the check is for a different version of this order');
  const to = report.verdict === 'PASS' ? 'checked' : 'blocked';
  const { approval: _drop, ...rest } = r;
  return move(rest as OrderRecord, to, report.verdict === 'PASS' ? 'rules check: within configured limits' : 'rules check: blocked', { check: report }, at);
}

/** Why an order cannot be approved right now, or null when it can. */
export function approvalBlocker(r: OrderRecord, today: string): string | null {
  if (r.state !== 'checked') return r.state === 'blocked' ? 'blocked_by_rules' : r.state === 'proposed' ? 'not_checked' : 'wrong_state';
  if (!r.check) return 'not_checked';
  if (r.check.fingerprint !== r.fingerprint) return 'check_outdated';
  if (r.check.date !== today) return 'check_not_today';
  if (r.check.verdict !== 'PASS') return 'blocked_by_rules';
  return null;
}

export function approve(r: OrderRecord, today: string, at?: string): OrderRecord {
  const why = approvalBlocker(r, today);
  if (why) throw new OrderStateError(`cannot approve: ${why}`);
  const when = at ?? new Date().toISOString();
  return move(r, 'approved', 'you confirmed this exact paper order', { approval: { at: when, fingerprint: r.fingerprint, method: 'button' } }, when);
}

export function submit(r: OrderRecord, brokerOrderId: string, at?: string): OrderRecord {
  if (!r.approval || r.approval.fingerprint !== r.fingerprint) throw new OrderStateError('cannot submit: no approval for this exact order');
  return move(r, 'submitted', `sent to the ${r.broker === 'demo' ? 'demo paper broker' : 'broker'}`, { brokerOrderId }, at);
}

export function fill(r: OrderRecord, qty: number, price: number, at?: string): OrderRecord {
  const total = Number(r.order.qty);
  const newQty = Math.min(total, r.filledQty + qty);
  const avg = r.filledQty === 0 ? price : ((r.avgFillPrice ?? price) * r.filledQty + price * (newQty - r.filledQty)) / newQty;
  const to: OrderState = newQty >= total ? 'filled' : 'partially_filled';
  return move(r, to, `${newQty} of ${total} shares filled at ${price.toFixed(2)}`, { filledQty: newQty, avgFillPrice: Math.round(avg * 100) / 100 }, at);
}

export function reject(r: OrderRecord, reason: string, at?: string) { return move(r, 'rejected', reason, {}, at); }
export function cancel(r: OrderRecord, reason = 'cancelled', at?: string) { return move(r, 'cancelled', reason, {}, at); }

/**
 * The order changed. The old version is superseded (its check and approval
 * stay in its history but no longer count); a new version starts as proposed.
 * Returns [old, new]. If the fingerprint did not change, nothing happens.
 */
export function revise(r: OrderRecord, next: ProposedOrder, planVersion: number, newId: string, at?: string): [OrderRecord, OrderRecord | null] {
  const fp = fingerprint(next as unknown as Record<string, unknown>);
  if (fp === r.fingerprint && planVersion === r.planVersion) return [r, null];
  if (TERMINAL.includes(r.state) || AT_BROKER.includes(r.state)) {
    return [r, propose(newId, next, planVersion, r.version + 1, at)];
  }
  const old = move(r, 'superseded', `replaced by v${r.version + 1}: the order or its plan changed, so this check and approval no longer count`, {}, at);
  return [old, propose(newId, next, planVersion, r.version + 1, at)];
}
