/**
 * Position sizing, ported from trader-budget/size.py `size_trade()` and
 * `bracket_order()`. Whole shares, the smallest of four limits, exact cents.
 *
 *   planned risk per share = entry - stop
 *   risk-based shares      = floor(max loss / risk per share)
 *   then the position cap, the max order and the cash after the buffer.
 */
import type { Config, ProposedOrder, SizeLimit, Sizing } from './types';

const EPS = 1e-7;
export const roundCent = (x: number) => Math.floor(x * 100 + 0.5 + EPS) / 100;
const cents = (x: number) => Math.round(x * 100);

/** Whole shares that fit in usd at perShare, in exact integer cents. */
export function sharesFor(usd: number, perShare: number) {
  const u = cents(usd);
  const p = cents(perShare);
  if (p <= 0 || u <= 0) return 0;
  return Math.floor(u / p);
}

const m = (x: number) => `$${x.toLocaleString('en-US', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const p2 = (x: number) => x.toFixed(2);

export interface SizeInput {
  symbol: string;
  entry: number;
  stop: number;
  target: number;
  config: Pick<Config, 'budget' | 'cash_buffer_pct' | 'max_position_pct' | 'max_order_usd' | 'min_order_usd' | 'max_loss_per_trade_usd' | 'min_reward_risk' | 'blocked'>;
  /** cash actually available in the account, if known (caps the size) */
  cash?: number | null;
  /** a fresh price; a market order is sized at the higher of it and the entry */
  freshPrice?: number | null;
  limitPrice?: number | null;
}

export type SizeRefusal =
  | 'blocked' | 'no_budget' | 'stop_not_below' | 'target_not_above' | 'zero_max_loss' | 'zero_other'
  | 'reward_risk' | 'min_order' | 'bad_input';

export function sizeTrade(i: SizeInput): Sizing {
  const c = i.config;
  const sym = i.symbol.trim().toUpperCase();
  const blocked = new Set((c.blocked ?? []).map((b) => b.toUpperCase()));
  let ref: number;
  let refFrom: Sizing['entry_from'];
  if (i.limitPrice != null) { ref = roundCent(i.limitPrice); refFrom = 'limit'; }
  else if (i.freshPrice != null && roundCent(i.freshPrice) > roundCent(i.entry)) { ref = roundCent(i.freshPrice); refFrom = 'price'; }
  else { ref = roundCent(i.entry); refFrom = 'plan'; }
  const stop = roundCent(i.stop);
  const target = roundCent(i.target);
  const base: Sizing = {
    symbol: sym, entry: ref, entry_from: refFrom, stop, target, risk_per_share: 0, reward_risk: 0,
    budget: c.budget, cash_buffer: 0, cash_available: 0, limits: [], qty: 0, bound_by: 'max loss',
    cost: 0, max_loss: 0, potential_gain: 0, refusal: null, refusal_code: null,
    order_type: i.limitPrice != null ? 'limit' : 'market',
  };
  const refuse = (code: SizeRefusal, msg: string): Sizing => ({ ...base, refusal: msg, refusal_code: code });

  if (![i.entry, i.stop, i.target].every((v) => Number.isFinite(v) && v > 0)) return refuse('bad_input', 'entry, stop and target must all be positive prices');
  if (blocked.has(sym)) return refuse('blocked', `${sym} is on your blocked list`);
  if (!(c.budget > 0)) return refuse('no_budget', 'no budget set');
  if (stop >= ref) return refuse('stop_not_below', `the stop ${p2(stop)} is not below the entry ${p2(ref)}`);
  if (target <= ref) return refuse('target_not_above', `the target ${p2(target)} is not above the entry ${p2(ref)}: the move has already happened`);

  const riskC = Math.round((ref - stop) * 100);
  const rewardC = Math.round((target - ref) * 100);
  const risk = riskC / 100;
  const cashBuffer = Math.round(c.budget * c.cash_buffer_pct) / 100;
  let available = c.budget - cashBuffer;
  let cashNote = `budget ${m(c.budget)} minus the ${m(cashBuffer)} cash buffer`;
  if (i.cash != null && i.cash - cashBuffer < available - 0.005) {
    available = i.cash - cashBuffer;
    cashNote = `cash ${m(i.cash)} minus the ${m(cashBuffer)} buffer`;
  }
  available = Math.max(Math.round(available * 100) / 100, 0);

  const limits: SizeLimit[] = [];
  if (c.max_loss_per_trade_usd) {
    limits.push({ name: 'max loss', usd: c.max_loss_per_trade_usd, per: risk, shares: sharesFor(c.max_loss_per_trade_usd, risk), how: `${m(c.max_loss_per_trade_usd)} max loss / ${p2(risk)} risk a share`, binds: false });
  }
  if (c.max_position_pct) {
    const cap = Math.round(c.budget * c.max_position_pct) / 100;
    limits.push({ name: 'position cap', usd: cap, per: ref, shares: sharesFor(cap, ref), how: `${c.max_position_pct}% of ${m(c.budget)} = ${m(cap)} / ${p2(ref)}`, binds: false });
  }
  if (c.max_order_usd) {
    limits.push({ name: 'max order', usd: c.max_order_usd, per: ref, shares: sharesFor(c.max_order_usd, ref), how: `${m(c.max_order_usd)} / ${p2(ref)}`, binds: false });
  }
  limits.push({ name: 'cash', usd: available, per: ref, shares: sharesFor(available, ref), how: `${cashNote} = ${m(available)} / ${p2(ref)}`, binds: false });

  const qty = Math.max(0, Math.min(...limits.map((l) => l.shares)));
  const bound = limits.find((l) => l.shares === qty)!;
  limits.forEach((l) => (l.binds = l === bound));
  const cost = Math.round(qty * ref * 100) / 100;
  const loss = (qty * riskC) / 100;
  const gain = (qty * rewardC) / 100;
  const out: Sizing = {
    ...base, risk_per_share: risk, reward_risk: Math.round((rewardC / riskC) * 100) / 100, cash_buffer: cashBuffer,
    cash_available: available, limits, qty, bound_by: bound.name, cost, max_loss: loss, potential_gain: gain,
  };
  if (qty === 0) {
    return bound.name === 'max loss'
      ? { ...out, refusal: `one share risks ${m(risk)}, more than your ${m(c.max_loss_per_trade_usd)} max loss per trade`, refusal_code: 'zero_max_loss' }
      : { ...out, refusal: `one share costs ${m(ref)}, more than your ${bound.name} limit (${bound.how})`, refusal_code: 'zero_other' };
  }
  if (c.min_reward_risk && rewardC < c.min_reward_risk * riskC - EPS) {
    return { ...out, refusal: `reward:risk ${(rewardC / riskC).toFixed(2)} is under your minimum ${c.min_reward_risk}`, refusal_code: 'reward_risk' };
  }
  if (cost < (c.min_order_usd || 0) - 0.005) {
    return { ...out, refusal: `${qty} shares is ${m(cost)}, under your ${m(c.min_order_usd)} minimum order`, refusal_code: 'min_order' };
  }
  return out;
}

const SETUP_WORDS: Record<string, string> = { orb: 'opening-range breakout', level: 'level breakout' };

/** The one bracket order, Alpaca place_stock_order fields as strings, plus notes never sent. */
export function bracketOrder(s: Sizing, extra: { setup: string; entry_time: string; flat_by: string; max_loss_per_trade_usd: number }): ProposedOrder | null {
  if (s.refusal || s.qty <= 0) return null;
  const o: ProposedOrder = { symbol: s.symbol, side: 'buy', qty: String(s.qty), type: s.order_type, time_in_force: 'day' };
  if (s.order_type === 'limit') o.limit_price = p2(s.entry);
  const boundWords: Record<string, string> = {
    'max loss': `${m(extra.max_loss_per_trade_usd)} max loss per trade`, 'position cap': 'position cap',
    'max order': 'max order', cash: 'cash after the buffer',
  };
  o.order_class = 'bracket';
  o.take_profit_limit_price = p2(s.target);
  o.stop_loss_stop_price = p2(s.stop);
  o.why = `${SETUP_WORDS[extra.setup] ?? 'day trade'} on ${s.symbol}: ${s.qty} shares, bound by your ${boundWords[s.bound_by]} (${s.qty} x ${p2(s.risk_per_share)} = $${s.max_loss.toFixed(2)} at the stop)`;
  o.plan = { entry: s.entry, stop: s.stop, target: s.target, risk_per_share: s.risk_per_share, max_loss: s.max_loss, setup: extra.setup, entry_time: extra.entry_time, flat_by: extra.flat_by };
  return o;
}
