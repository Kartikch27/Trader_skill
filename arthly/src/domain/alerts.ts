/**
 * Alert rules, the same types as trader-alerts/alerts.py. Each rule rings
 * once (per trading day for time / opening_bell / pct_move) until reset or
 * re-armed. An alert is information, never an order.
 */
import type { AlertFire, AlertRule, Quote } from './types';
import { flatByFor, hhmmToMin, session, type NyNow } from './market';

export interface AlertCheckInput {
  rules: AlertRule[];
  fired: Record<string, AlertFire>;
  quotes: Record<string, Quote>;
  now: NyNow;
}

export function describeRule(r: AlertRule): string {
  switch (r.type) {
    case 'above': return `${r.symbol} at or above ${r.price?.toFixed(2)}`;
    case 'below': return `${r.symbol} at or below ${r.price?.toFixed(2)}`;
    case 'stop': return `${r.symbol} at or below the stop ${r.price?.toFixed(2)}`;
    case 'target': return `${r.symbol} at or above the target ${r.price?.toFixed(2)}`;
    case 'pct_move': return `${r.symbol} moves ${r.pct}% ${r.direction ?? 'either way'} from the previous close`;
    case 'time': return `the New York clock passes ${r.at}${r.before_close ? ' (3 hours earlier on a 1:00 p.m. early close)' : ''}`;
    case 'opening_bell': return 'the NYSE opens (9:30 a.m. New York)';
  }
}

export function needsSymbol(t: AlertRule['type']) { return t !== 'time' && t !== 'opening_bell'; }

export function validateRule(r: Partial<AlertRule>): string | null {
  if (!r.type) return 'pick a type';
  if (needsSymbol(r.type) && !/^[A-Z]{1,5}(\.[A-Z])?$/.test(r.symbol ?? '')) return 'enter a US stock ticker';
  if (['above', 'below', 'stop', 'target'].includes(r.type) && !(Number(r.price) > 0)) return 'enter a price above 0';
  if (r.type === 'pct_move' && !(Number(r.pct) > 0)) return 'enter a percent above 0';
  if (r.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.at ?? '')) return 'enter a time like 15:55';
  return null;
}

/** Returns the rules that ring now (and were not already rung). */
export function checkAlerts(i: AlertCheckInput): AlertFire[] {
  const s = session(i.now);
  const tradingDay = s.phase === 'open' || s.phase === 'pre_market' || s.phase === 'after_close';
  const out: AlertFire[] = [];
  const at = `${i.now.date}T${i.now.time}`;
  for (const r of i.rules) {
    if (r.date && r.date !== i.now.date) continue;
    const prev = i.fired[r.id];
    const perDay = r.type === 'time' || r.type === 'opening_bell' || r.type === 'pct_move';
    if (prev && (!perDay || prev.at.slice(0, 10) === i.now.date)) continue;
    const q = r.symbol ? i.quotes[r.symbol] : undefined;
    let msg: string | null = null;
    switch (r.type) {
      case 'above': case 'target':
        if (q && r.price != null && q.price >= r.price) msg = `${r.symbol} ${q.price.toFixed(2)} is at or above ${r.price.toFixed(2)}${r.type === 'target' ? ' (target)' : ''}`;
        break;
      case 'below': case 'stop':
        if (q && r.price != null && q.price <= r.price) msg = `${r.symbol} ${q.price.toFixed(2)} is at or below ${r.price.toFixed(2)}${r.type === 'stop' ? ' (stop)' : ''}`;
        break;
      case 'pct_move':
        if (q?.prev_close && r.pct) {
          const move = (q.price / q.prev_close - 1) * 100;
          const hit = r.direction === 'up' ? move >= r.pct : r.direction === 'down' ? move <= -r.pct : Math.abs(move) >= r.pct;
          if (hit) msg = `${r.symbol} is ${move >= 0 ? '+' : ''}${move.toFixed(2)}% from the previous close ${q.prev_close.toFixed(2)}`;
        }
        break;
      case 'time': {
        if (!tradingDay || !r.at) break;
        const when = r.before_close ? flatByFor(s, r.at) : r.at;
        if (i.now.minutes >= hhmmToMin(when)) msg = `${r.label ?? 'time'}: it is ${i.now.time} New York (set for ${when})`;
        break;
      }
      case 'opening_bell':
        if (s.phase === 'open') msg = `the NYSE is open (${i.now.time} New York)`;
        break;
    }
    if (msg) out.push({ id: r.id, at, message: msg, price: q?.price });
  }
  return out;
}

/** The three alerts trader-alerts writes from a plan: stop, target, flat by close. */
export function alertsFromPlan(p: { symbol: string; date: string; stop: number; target: number; flat_by: string; stop_label?: string; target_label?: string }): AlertRule[] {
  const s = p.symbol.toLowerCase();
  return [
    { id: `${s}-plan-stop`, symbol: p.symbol, type: 'stop', price: p.stop, note: `plan stop: ${p.stop_label ?? ''}`.trim(), date: p.date },
    { id: `${s}-plan-target`, symbol: p.symbol, type: 'target', price: p.target, note: `plan target: ${p.target_label ?? ''}`.trim(), date: p.date },
    { id: `${s}-flat-by`, symbol: p.symbol, type: 'time', at: p.flat_by, label: 'flat by close', before_close: true, date: p.date },
  ];
}
