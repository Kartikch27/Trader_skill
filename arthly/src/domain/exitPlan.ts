/**
 * Exit planning, ported from trader-exit/exit.py `compute()`.
 * Exact cents: the stop rounds DOWN (away from a long's entry), the target
 * rounds half up, and the same refusals apply. Long side only.
 */
import type { Bar, OpeningRange, StopRule, TargetRule } from './types';
import { hhmmToMin } from './market';

const EPS = 1e-7;
export const MIN_RISK_PCT = 0.05;
export const ATR_BARS = 14;

/** Round half up to the cent, in integer cents. */
export const toCents = (x: number) => Math.floor(x * 100 + 0.5 + EPS);
const floorCents = (rawCents: number) => Math.floor(rawCents + EPS);
const c2d = (c: number) => Math.round(c) / 100;

export interface ExitInput {
  entry: number;
  stopRule: StopRule;
  stopValue?: number;          // price for 'price', percent for 'pct', K for 'atr'
  targetRule: TargetRule;
  targetValue: number;         // R multiple for 'r', price for 'price'
  openingRange?: OpeningRange;
  atr?: { value: number; bars: number };
  entryTime?: string;          // "10:15"
  flatBy?: string;             // "15:55"
}

export type ExitErrorCode =
  | 'entry_nonpositive' | 'needs_range' | 'range_inverted' | 'needs_stop_value' | 'needs_bars'
  | 'stop_at_or_above_entry' | 'stop_nonpositive' | 'too_tight' | 'target_at_or_below_entry'
  | 'bad_target' | 'entry_after_flat_by';

export interface ExitError { code: ExitErrorCode; params: Record<string, string | number> }

export interface ExitPlanCalc {
  entry: number;
  stop: number;
  stopLabel: string;
  stopDetail: string;
  target: number;
  targetR: number;
  targetLabel: string;
  riskPerShare: number;
  rewardPerShare: number;
  rewardRisk: number;
  riskPct: number;
}

export type ExitResult = { ok: true; plan: ExitPlanCalc } | { ok: false; error: ExitError };

const fail = (code: ExitErrorCode, params: Record<string, string | number> = {}): ExitResult => ({ ok: false, error: { code, params } });
const fmt = (c: number) => (c / 100).toFixed(2);
const words: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
const num = (x: number) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(4)));

export function computeExit(i: ExitInput): ExitResult {
  const e = toCents(i.entry);
  if (!(e > 0)) return fail('entry_nonpositive');
  if (i.entryTime && i.flatBy && hhmmToMin(i.entryTime) >= hhmmToMin(i.flatBy)) {
    return fail('entry_after_flat_by', { entry: i.entryTime, flat: i.flatBy });
  }
  let raw: number;
  let label: string;
  let detail = '';
  switch (i.stopRule) {
    case 'or_mid':
    case 'or_low': {
      if (!i.openingRange) return fail('needs_range');
      const oh = toCents(i.openingRange.high);
      const ol = toCents(i.openingRange.low);
      if (oh <= ol) return fail('range_inverted', { high: fmt(oh), low: fmt(ol) });
      if (i.stopRule === 'or_mid') {
        raw = (oh + ol) / 2;
        label = 'opening-range midpoint';
        detail = `($${fmt(oh)} + $${fmt(ol)}) / 2 = $${num(raw / 100)}`;
      } else {
        raw = ol;
        label = 'opening-range low';
      }
      break;
    }
    case 'price':
      if (i.stopValue == null || Number.isNaN(i.stopValue)) return fail('needs_stop_value');
      raw = i.stopValue * 100;
      label = 'your price';
      break;
    case 'pct':
      if (i.stopValue == null || !(i.stopValue > 0)) return fail('needs_stop_value');
      raw = (e * (100 - i.stopValue)) / 100;
      label = `${num(i.stopValue)}% under the entry`;
      detail = `$${fmt(e)} x (1 - ${num(i.stopValue)}%) = $${num(raw / 100)}`;
      break;
    case 'atr': {
      if (!i.atr) return fail('needs_bars');
      if (i.stopValue == null || !(i.stopValue > 0)) return fail('needs_stop_value');
      const a = Math.round(i.atr.value * 1e6) / 1e6;
      raw = e - i.stopValue * a * 100;
      label = `${num(i.stopValue)} x ATR(${i.atr.bars}) under the entry`;
      detail = `ATR $${a.toFixed(4)} over the ${i.atr.bars} bars to the entry${i.atr.bars < ATR_BARS ? ' (fewer than 14 so far)' : ''}`;
      break;
    }
  }
  const stop = floorCents(raw);
  if (Math.abs(stop - raw) > EPS) detail = detail ? `${detail}, rounded down` : `$${num(raw / 100)} rounded down`;
  if (stop >= e) return fail('stop_at_or_above_entry', { stop: fmt(stop), entry: fmt(e), label });
  if (stop <= 0) return fail('stop_nonpositive', { stop: fmt(stop) });
  const risk = e - stop;
  const floorRisk = (e * MIN_RISK_PCT) / 100;
  if (risk < floorRisk - EPS) {
    return fail('too_tight', { risk: fmt(risk), floor: fmt(Math.floor(floorRisk + 0.5)), entry: fmt(e) });
  }
  let target: number;
  let targetLabel: string;
  let targetR: number;
  if (i.targetRule === 'r') {
    if (!(i.targetValue > 0)) return fail('bad_target');
    target = Math.floor(e + i.targetValue * risk + 0.5 + EPS);
    targetR = i.targetValue;
    const n = Number.isInteger(i.targetValue) ? words[i.targetValue] : undefined;
    targetLabel = `${num(i.targetValue)}R (${n ?? num(i.targetValue)} times the risk)`;
  } else {
    if (!(i.targetValue > 0)) return fail('bad_target');
    target = toCents(i.targetValue);
    targetR = Math.floor(((target - e) / risk) * 100 + 0.5 + EPS) / 100;
    targetLabel = `your price (${targetR.toFixed(2)}R)`;
  }
  if (target <= e) return fail('target_at_or_below_entry', { target: fmt(target), entry: fmt(e) });
  const rr = Math.floor(((target - e) / risk) * 100 + 0.5 + EPS) / 100;
  return {
    ok: true,
    plan: {
      entry: c2d(e), stop: c2d(stop), stopLabel: label, stopDetail: detail, target: c2d(target), targetR, targetLabel,
      riskPerShare: c2d(risk), rewardPerShare: c2d(target - e), rewardRisk: rr, riskPct: +((risk / e) * 100).toFixed(2),
    },
  };
}

/** Average true range of the last n bars (all if fewer), first bar uses its own range. Same as exit.py atr_of. */
export function atrOf(bars: Pick<Bar, 'h' | 'l' | 'c'>[], n = ATR_BARS) {
  const trs: number[] = [];
  let prev: number | null = null;
  for (const b of bars) {
    let tr = b.h - b.l;
    if (prev != null) tr = Math.max(tr, Math.abs(b.h - prev), Math.abs(b.l - prev));
    trs.push(tr);
    prev = b.c;
  }
  const use = trs.slice(-n);
  return { value: use.reduce((a, b) => a + b, 0) / (use.length || 1), bars: use.length };
}
