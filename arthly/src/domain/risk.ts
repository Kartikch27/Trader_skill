/**
 * Trading Rules Check: a browser preview of trader-risk/check.py for ONE order.
 * The authoritative check is check.py on the server; this preview uses the
 * same rules so the screen can explain each one. Exits (sells that only
 * reduce what you hold) are checked for format, asset and shorting only:
 * getting out is never blocked by a day limit.
 */
import type { Config, ProposedOrder, RiskReport, RuleCheck } from './types';
import { fingerprint } from './fingerprint';
import { entryWindow, hhmmToMin, session, type NyNow } from './market';

const CENT = 0.005;
const m = (x: number) => `$${x.toFixed(2)}`;
const f = (x: unknown) => {
  const v = typeof x === 'string' ? Number(x) : (x as number);
  return Number.isFinite(v) ? v : null;
};

export interface RiskContext {
  config: Config;
  now: NyNow;
  /** cash in the account; holdings by symbol (shares) and their value */
  cash: number;
  holdings: Record<string, { qty: number; value: number }>;
  /** entries placed today (from the order log): max loss each */
  entriesToday: { symbol: string; side: string; maxLoss: number }[];
  ordersToday: number;
  /** a fresh price (under 15 minutes old) for the symbol, if any */
  freshPrice?: number | null;
  /** day trades in the last five business days, for pdt_guard */
  dayTrades5d?: number;
}

export type CheckId =
  | 'format' | 'asset' | 'short' | 'blocked' | 'size' | 'position' | 'cash' | 'stop' | 'loss'
  | 'reward_risk' | 'daily_loss' | 'trades' | 'window' | 'pdt' | 'duplicate' | 'daily_limit';

export const CHECK_ORDER: CheckId[] = [
  'format', 'asset', 'short', 'blocked', 'size', 'position', 'cash', 'stop', 'loss', 'reward_risk',
  'daily_loss', 'trades', 'window', 'pdt', 'duplicate', 'daily_limit',
];

export function checkOrder(o: ProposedOrder, ctx: RiskContext): RiskReport {
  const c = ctx.config;
  const checks: RuleCheck[] = [];
  const add = (id: CheckId, status: RuleCheck['status'], detail: string) => checks.push({ id, status, detail });
  const sym = (o.symbol || '').toUpperCase();
  const qty = f(o.qty);
  const held = ctx.holdings[sym]?.qty ?? 0;
  const kind: 'entry' | 'exit' = o.side === 'sell' && qty != null && qty <= held + 1e-9 ? 'exit' : 'entry';
  const isEntry = kind === 'entry';
  /** for an exit, a would-be block becomes a warning */
  const gate = (id: CheckId, detail: string) => add(id, isEntry ? 'block' : 'warn', detail);

  // the entry it measures from: limit price, else the higher of the plan's entry and a fresh price
  const planEntry = o.plan?.entry ?? null;
  let ref: number | null = o.type === 'limit' ? f(o.limit_price) : planEntry;
  let refFrom = o.type === 'limit' ? 'the limit price' : "the plan's entry";
  if (o.type !== 'limit' && ctx.freshPrice != null && (ref == null || ctx.freshPrice > ref + CENT)) {
    ref = ctx.freshPrice;
    refFrom = 'a fresh price';
  }
  const value = ref != null && qty != null ? Math.round(qty * ref * 100) / 100 : null;

  // format
  const fmtProblems: string[] = [];
  if (!sym) fmtProblems.push('no symbol');
  if (o.side !== 'buy' && o.side !== 'sell') fmtProblems.push('side must be buy or sell');
  if (qty == null || qty <= 0) fmtProblems.push('quantity must be a positive number');
  if (o.type === 'limit' && f(o.limit_price) == null) fmtProblems.push('a limit order needs a limit price');
  if (o.order_class === 'bracket') {
    if (qty != null && !Number.isInteger(qty)) fmtProblems.push('a bracket order takes whole shares only');
    if (o.time_in_force !== 'day' && o.time_in_force !== 'gtc') fmtProblems.push('a bracket order is day or gtc');
    if (f(o.stop_loss_stop_price) == null || f(o.take_profit_limit_price) == null) fmtProblems.push('a bracket order needs both a stop-loss and a take-profit');
  }
  add('format', fmtProblems.length ? 'block' : 'ok', fmtProblems.join('; ') || 'symbol, side, whole-share quantity and bracket legs are all present');

  // asset: plain US stock ticker; options and crypto are off
  const isOption = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(sym);
  const isTicker = /^[A-Z]{1,5}(\.[A-Z])?$/.test(sym);
  if (isOption && !c.allow_options) add('asset', 'block', `${sym} is an option; options are off ("allow_options": false)`);
  else if (!isTicker) add('asset', 'block', `${sym || 'this'} is not a US stock ticker (crypto and other assets are not supported)`);
  else add('asset', 'ok', `${sym} is a US stock ticker`);

  // short
  if (o.side === 'sell' && kind === 'entry' && !c.allow_short) add('short', 'block', `selling more ${sym} than you hold (${held} shares); short selling is off`);
  else add('short', 'ok', o.side === 'buy' ? 'a buy, not a short sale' : `sells only shares you hold (${held})`);

  // blocked list
  if ((c.blocked ?? []).map((b) => b.toUpperCase()).includes(sym)) gate('blocked', `${sym} is on your blocked list`);
  else add('blocked', 'ok', `${sym} is not on your blocked list`);

  // size
  if (value == null) add('size', isEntry ? 'needs_info' : 'warn', `no price for ${sym} to value this order; refresh the quote`);
  else if (value < (c.min_order_usd || 0) - CENT) gate('size', `${m(value)} is under your ${m(c.min_order_usd)} minimum order`);
  else if (c.max_order_usd && value > c.max_order_usd + CENT) gate('size', `${m(value)} is over your ${m(c.max_order_usd)} max order`);
  else add('size', 'ok', `${value != null ? m(value) : '—'} is between your ${m(c.min_order_usd)} minimum and ${m(c.max_order_usd)} maximum`);

  // account effects
  const holdingsValue = Object.values(ctx.holdings).reduce((a, h) => a + h.value, 0);
  const total = ctx.cash + holdingsValue;
  const bufferUsd = (total * (c.cash_buffer_pct || 0)) / 100;
  if (isEntry && o.side === 'buy' && value != null) {
    const after = ctx.cash - value;
    if (after < -CENT && !c.allow_margin) add('cash', 'block', `needs ${m(value)} but only ${m(ctx.cash)} cash; that would be margin (borrowed money), which is off`);
    else if (after < bufferUsd - CENT) add('cash', 'block', `leaves ${m(Math.max(after, 0))} cash, under your ${c.cash_buffer_pct}% buffer of ${m(bufferUsd)}`);
    else add('cash', 'ok', `leaves ${m(after)} cash, above your ${c.cash_buffer_pct}% buffer of ${m(bufferUsd)}`);
    const posAfter = (ctx.holdings[sym]?.value ?? 0) + value;
    const limit = (total * (c.max_position_pct || 100)) / 100;
    if (total > 0 && posAfter > limit + CENT) add('position', 'block', `${sym} would be ${m(posAfter)}, ${((100 * posAfter) / total).toFixed(1)}% of the ${m(total)} account, over your ${c.max_position_pct}% cap`);
    else add('position', 'ok', `${sym} would be ${((100 * posAfter) / (total || 1)).toFixed(1)}% of the account (cap ${c.max_position_pct}%)`);
  } else {
    add('cash', 'ok', isEntry ? 'needs a price to check' : 'a sell adds cash');
    add('position', 'ok', isEntry ? 'needs a price to check' : 'a sell reduces the position');
  }

  // stop, loss, reward:risk
  let maxLoss: number | null = null;
  let rr: number | null = null;
  if (isEntry) {
    const legStop = f(o.stop_loss_stop_price);
    const stop = legStop ?? o.plan?.stop ?? null;
    const target = f(o.take_profit_limit_price) ?? o.plan?.target ?? null;
    if (!stop) {
      if (c.require_stop) add('stop', 'block', 'no stop. Every entry needs one ("require_stop": true)');
      else add('stop', 'warn', 'no stop: the max loss is not capped');
      add('loss', 'needs_info', 'needs a stop to measure the loss');
      add('reward_risk', 'needs_info', 'needs a stop to measure reward:risk');
    } else if (ref == null) {
      add('stop', 'needs_info', 'needs a price to compare the stop with');
      add('loss', 'needs_info', 'needs a price');
      add('reward_risk', 'needs_info', 'needs a price');
    } else if (stop >= ref - CENT) {
      add('stop', 'block', `the stop ${stop.toFixed(2)} must be below the entry ${ref.toFixed(2)} for a buy`);
      add('loss', 'needs_info', 'needs a stop below the entry');
      add('reward_risk', 'needs_info', 'needs a stop below the entry');
    } else {
      add('stop', legStop ? 'ok' : 'warn', legStop ? `stop-loss ${stop.toFixed(2)} sits at the broker with the order` : `the stop ${stop.toFixed(2)} is in the plan only, not at the broker`);
      const riskC = Math.round(Math.abs(ref - stop) * 100);
      const riskPs = riskC / 100;
      maxLoss = Math.round((qty ?? 0) * riskPs * 100) / 100;
      const cap = c.max_loss_per_trade_usd;
      if (cap && maxLoss > cap + CENT) add('loss', 'block', `${qty} shares x ${riskPs.toFixed(2)} risk a share = ${m(maxLoss)} at the stop, over your ${m(cap)} max loss per trade (measured from ${refFrom})`);
      else add('loss', 'ok', `${qty} shares x ${riskPs.toFixed(2)} = ${m(maxLoss)} at the stop price (limit ${m(cap)}), measured from ${refFrom}`);
      if (target == null) add('reward_risk', c.min_reward_risk ? 'block' : 'ok', 'no target to measure reward:risk against');
      else if (target <= ref + CENT) add('reward_risk', 'block', `the target ${target.toFixed(2)} must be above the entry ${ref.toFixed(2)}`);
      else {
        rr = Math.round((Math.round((target - ref) * 100) / riskC) * 100) / 100;
        if (c.min_reward_risk && rr < c.min_reward_risk - 1e-9) add('reward_risk', 'block', `reward:risk ${rr.toFixed(2)} is under your minimum ${c.min_reward_risk}`);
        else add('reward_risk', 'ok', `reward:risk ${rr.toFixed(2)} (minimum ${c.min_reward_risk})`);
      }
    }
    // day limits
    const used = ctx.entriesToday.reduce((a, e) => a + e.maxLoss, 0);
    if (c.max_daily_loss_usd && maxLoss != null && used + maxLoss > c.max_daily_loss_usd + CENT) add('daily_loss', 'block', `${m(used)} already at risk today plus ${m(maxLoss)} = ${m(used + maxLoss)}, over your ${m(c.max_daily_loss_usd)} daily loss limit`);
    else add('daily_loss', maxLoss == null ? 'needs_info' : 'ok', maxLoss == null ? 'needs the max loss first' : `${m(used)} used today; this adds ${m(maxLoss)} of your ${m(c.max_daily_loss_usd)} limit`);
    const n = ctx.entriesToday.length;
    if (c.max_trades_per_day && n >= c.max_trades_per_day) add('trades', 'block', `${n} entries already today; your limit is ${c.max_trades_per_day} a day`);
    else add('trades', 'ok', `${n} of ${c.max_trades_per_day} entries used today`);
    // window
    const s = session(ctx.now);
    const w = entryWindow(s, c.no_entries_before, c.no_entries_after);
    if (s.phase !== 'open') add('window', 'block', s.phase === 'closed_holiday' ? `the market is closed today (${s.holiday})` : s.phase === 'closed_weekend' ? 'the market is closed (weekend)' : s.phase === 'unknown_calendar' ? 'the holiday calendar for this year is unknown' : 'the market is not open right now');
    else if (w.from && ctx.now.minutes < hhmmToMin(w.from)) add('window', 'block', `no new entries before ${w.from} New York time (it is ${ctx.now.time})`);
    else if (w.to && ctx.now.minutes > hhmmToMin(w.to)) add('window', 'block', `no new entries after ${w.to} New York time (it is ${ctx.now.time})`);
    else add('window', 'ok', `${ctx.now.time} New York is inside your ${w.from ?? 'open'}–${w.to ?? 'close'} entry window`);
    if (c.pdt_guard && (ctx.dayTrades5d ?? 0) >= 3) add('pdt', 'block', `${ctx.dayTrades5d} day trades in the last 5 business days ("pdt_guard": true)`);
    else add('pdt', 'ok', c.pdt_guard ? `${ctx.dayTrades5d ?? 0} day trades in the last 5 business days` : 'pattern-day-trader guard is off');
    if (ctx.entriesToday.some((e) => e.symbol === sym && e.side === o.side)) add('duplicate', 'block', `${o.side} ${sym} was already placed today`);
    else add('duplicate', 'ok', `no ${o.side} ${sym} placed yet today`);
    if (c.max_orders_per_day && ctx.ordersToday >= c.max_orders_per_day) add('daily_limit', 'block', `${ctx.ordersToday} orders placed today; your limit is ${c.max_orders_per_day}`);
    else add('daily_limit', 'ok', `${ctx.ordersToday} of ${c.max_orders_per_day} orders used today`);
  } else {
    for (const id of ['stop', 'loss', 'reward_risk', 'daily_loss', 'trades', 'window', 'pdt', 'duplicate', 'daily_limit'] as CheckId[]) {
      add(id, 'ok', 'an exit: getting out is never blocked by this rule');
    }
  }

  checks.sort((a, b) => CHECK_ORDER.indexOf(a.id as CheckId) - CHECK_ORDER.indexOf(b.id as CheckId));
  const blocked = checks.some((x) => x.status === 'block' || x.status === 'needs_info');
  return {
    fingerprint: fingerprint(o as unknown as Record<string, unknown>),
    verdict: blocked ? 'BLOCK' : 'PASS',
    kind,
    checks,
    max_loss: maxLoss,
    reward_risk: rr,
    value_usd: value ?? 0,
    checked_at: new Date().toISOString(),
    date: ctx.now.date,
    source: 'browser-preview',
  };
}
