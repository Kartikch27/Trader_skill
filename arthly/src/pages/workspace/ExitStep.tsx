import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useStore, type PlanInputs } from '../../state/store';
import { useAsync, useMode, useT } from '../../state/hooks';
import { Banner, Card, DataGate, Field, NumberInput, Pill, Stat, Term, WhyDisabled } from '../../components/ui';
import { PriceChart } from '../../components/PriceChart';
import { atrOf, computeExit } from '../../domain/exitPlan';
import { watchEntry } from '../../domain/entryWatch';
import { hhmmToMin } from '../../domain/market';
import { price as fp } from '../../domain/format';
import { useBars, useScanHits, PLAN_DAY } from './shared';
import type { Bar, StopRule, TargetRule } from '../../domain/types';
import type { Key } from '../../i18n/dict';

const to24 = (ampm: string) => {
  const m = ampm.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return ampm;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

export function ExitStep({ symbol }: { symbol: string }) {
  const bars = useBars(symbol);
  const hits = useScanHits(symbol);
  const saved = useStore((s) => s.plan);
  const toolPlan = useAsync((svc) => svc.savedPlan(symbol), [symbol]);
  return (
    <DataGate state={bars} lines={6}>
      {(b) => {
        // the starting point: your saved plan, else the plan trader-exit wrote, else the entry trigger, else the scanner's candle
        let seed: PlanInputs | null = saved && saved.inputs.symbol === symbol ? saved.inputs : null;
        if (!seed && toolPlan.status === 'ready' && toolPlan.data) {
          const p = toolPlan.data;
          seed = { symbol, date: p.date, setup: p.setup, entry: p.entry, entryTime: to24(p.entry_time), entryBar: p.entry_bar, stopRule: p.stop_rule, targetRule: 'r', targetValue: p.target_r, flatBy: p.flat_by, openingRange: p.opening_range };
        }
        if (!seed && b) {
          const r = watchEntry({ bars: b.today, nowMinutes: hhmmToMin('10:15') });
          if (r.trigger && r.range) seed = { symbol, date: PLAN_DAY, setup: 'orb', entry: r.trigger.price, entryTime: to24(r.trigger.time), entryBar: r.trigger.barIndex, stopRule: 'or_mid', targetRule: 'r', targetValue: 2, flatBy: '15:55', openingRange: { high: r.range.high, low: r.range.low, minutes: 15 } };
        }
        if (!seed && hits.status === 'ready') {
          const h = hits.data.find((x) => x.mode === 'orb')?.hit;
          if (h && h.or_high && h.or_low) seed = { symbol, date: PLAN_DAY, setup: 'orb', entry: h.price, entryTime: to24(h.at ?? '10:15 AM'), entryBar: h.bar_index, stopRule: 'or_mid', targetRule: 'r', targetValue: 2, flatBy: '15:55', openingRange: { high: h.or_high, low: h.or_low, minutes: 15 } };
        }
        seed ??= { symbol, date: PLAN_DAY, setup: 'level', entry: hits.status === 'ready' ? hits.data[0]?.hit.price ?? 0 : 0, entryTime: '10:15', stopRule: 'pct', stopValue: 1.5, targetRule: 'r', targetValue: 2, flatBy: '15:55' };
        return <ExitForm key={`${symbol}-${saved?.version ?? 0}-${toolPlan.status}`} seed={seed} bars={b?.today ?? null} allBars={b?.all ?? null} />;
      }}
    </DataGate>
  );
}

function ExitForm({ seed, bars, allBars }: { seed: PlanInputs; bars: Bar[] | null; allBars: Bar[] | null }) {
  const t = useT();
  const mode = useMode();
  const nav = useNavigate();
  const saved = useStore((s) => s.plan);
  const savePlan = useStore((s) => s.savePlan);
  const [f, setF] = useState<PlanInputs>(seed);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => setJustSaved(false), [f]);
  const set = <K extends keyof PlanInputs>(k: K, v: PlanInputs[K]) => setF((x) => ({ ...x, [k]: v }));

  const atr = useMemo(() => (bars && f.entryBar != null ? atrOf(bars.slice(0, f.entryBar + 1)) : undefined), [bars, f.entryBar]);
  const res = computeExit({ entry: f.entry, stopRule: f.stopRule, stopValue: f.stopValue, targetRule: f.targetRule, targetValue: f.targetValue, openingRange: f.openingRange, atr, entryTime: f.entryTime, flatBy: f.flatBy });
  const isSaved = !!saved && saved.inputs.symbol === f.symbol && JSON.stringify(saved.inputs) === JSON.stringify(f);
  const dirty = !!saved && saved.inputs.symbol === f.symbol && !isSaved;
  const stopRules: StopRule[] = f.openingRange ? ['or_mid', 'or_low', 'price', 'pct', ...(mode === 'pro' && atr ? (['atr'] as StopRule[]) : [])] : ['price', 'pct'];

  const lines = res.ok ? [
    { price: res.plan.entry, label: 'Entry', tone: 'entry' as const },
    { price: res.plan.stop, label: 'Stop', tone: 'stop' as const },
    { price: res.plan.target, label: 'Target', tone: 'target' as const },
  ] : [];
  const errText = !res.ok ? t(`exit.err.${res.error.code}` as Key, res.error.params) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card title={t('exit.title')} className="lg:col-span-2">
        <p className="mb-4 text-sm text-muted">{t('exit.intro')} {t('ws.longOnly')}</p>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (res.ok) { savePlan(f, res.plan); setJustSaved(true); } }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="x-entry" label={<Term k="entry">{t('exit.entry')}</Term>}>
              <NumberInput id="x-entry" value={f.entry} onChange={(v) => set('entry', v ?? 0)} prefix="$" invalid={!res.ok && res.error.code === 'entry_nonpositive'} />
            </Field>
            <Field htmlFor="x-flat" label={<Term k="flatBy">{t('exit.flatBy')}</Term>}>
              <input id="x-flat" type="time" className="input" value={f.flatBy} onChange={(e) => set('flatBy', e.target.value)} aria-invalid={!res.ok && res.error.code === 'entry_after_flat_by' || undefined} />
            </Field>
          </div>
          {mode === 'pro' && (
            <Field htmlFor="x-etime" label="Entry time (New York)">
              <input id="x-etime" type="time" className="input" value={f.entryTime} onChange={(e) => set('entryTime', e.target.value)} />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="x-srule" label={<Term k="stop">{t('exit.stopRule')}</Term>}>
              <select id="x-srule" className="input" value={f.stopRule} onChange={(e) => { const r = e.target.value as StopRule; setF((x) => ({ ...x, stopRule: r, stopValue: r === 'pct' ? 1.5 : r === 'atr' ? 1.5 : r === 'price' ? (res.ok ? res.plan.stop : x.entry * 0.98) : undefined })); }}>
                {stopRules.map((r) => <option key={r} value={r}>{t(`exit.stopRule.${r}` as Key)}</option>)}
              </select>
            </Field>
            {(f.stopRule === 'price' || f.stopRule === 'pct' || f.stopRule === 'atr') && (
              <Field htmlFor="x-sval" label={t(`exit.stopValue.${f.stopRule}` as Key)}>
                <NumberInput id="x-sval" value={f.stopValue} onChange={(v) => set('stopValue', v)} prefix={f.stopRule === 'price' ? '$' : undefined} suffix={f.stopRule === 'pct' ? '%' : f.stopRule === 'atr' ? '×' : undefined} step={f.stopRule === 'price' ? 0.01 : 0.1} />
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="x-trule" label={<Term k="target">{t('exit.targetRule')}</Term>}>
              <select id="x-trule" className="input" value={f.targetRule} onChange={(e) => { const r = e.target.value as TargetRule; setF((x) => ({ ...x, targetRule: r, targetValue: r === 'r' ? 2 : res.ok ? res.plan.target : x.entry * 1.04 })); }}>
                <option value="r">{t('exit.targetRule.r')}</option>
                <option value="price">{t('exit.targetRule.price')}</option>
              </select>
            </Field>
            {f.targetRule === 'r' ? (
              <Field htmlFor="x-tval" label={<Term k="R">R</Term>}>
                <select id="x-tval" className="input" value={f.targetValue} onChange={(e) => set('targetValue', Number(e.target.value))}>
                  {[1, 1.5, 2, 3].map((r) => <option key={r} value={r}>{r}R</option>)}
                </select>
              </Field>
            ) : (
              <Field htmlFor="x-tval" label={t('exit.targetRule.price')}>
                <NumberInput id="x-tval" value={f.targetValue} onChange={(v) => set('targetValue', v ?? 0)} prefix="$" />
              </Field>
            )}
          </div>

          {errText && <Banner tone="neg" title={t('size.refused')}>{errText}</Banner>}

          {res.ok && (
            <div className="rounded-lg border border-line bg-sunken/60 p-3">
              <dl className="grid grid-cols-2 gap-3">
                <Stat label={<Term k="stop">Stop</Term>} value={fp(res.plan.stop)} sub={res.plan.stopLabel} />
                <Stat label={<Term k="target">Target</Term>} value={fp(res.plan.target)} sub={res.plan.targetLabel} />
                <Stat label={<Term k="risk">{t('exit.riskPs')}</Term>} value={fp(res.plan.riskPerShare)} sub={`${res.plan.riskPct}% of the entry`} />
                <Stat label={t('exit.rewardPs')} value={fp(res.plan.rewardPerShare)} />
                <div className="col-span-2"><Stat label={<Term k="rr">{t('exit.rr')}</Term>} value={`${res.plan.rewardRisk.toFixed(2)} : 1`} /></div>
              </dl>
              {mode === 'pro' && res.plan.stopDetail && <p className="mt-2 font-mono text-xs text-muted">{res.plan.stopDetail}</p>}
              <p className="mt-2 text-xs text-muted">{t('exit.stopNote')}</p>
            </div>
          )}

          {dirty && <Banner tone="warn">{t('exit.unsaved', { v: saved!.version })}</Banner>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary" disabled={!res.ok || isSaved}><Save aria-hidden className="h-4 w-4" />{t('exit.save')}</button>
            {(isSaved || justSaved) && saved && <Pill tone="pos">{t('exit.saved', { v: saved.version })}</Pill>}
            {isSaved && <button type="button" className="btn-secondary" onClick={() => nav('/workspace/replay')}>{t('ws.step.replay')}</button>}
          </div>
          <WhyDisabled reason={!res.ok ? errText : null} />
        </form>
      </Card>
      <Card title={t('ctx.chart')} className="lg:col-span-3">
        {allBars ? <PriceChart bars={allBars.filter((b) => b.ny.startsWith(PLAN_DAY))} lines={lines} label={`${f.symbol} plan lines`} height={mode === 'pro' ? 420 : 320} /> : <p className="text-sm text-muted">{t('find.noDemoChart')}</p>}
      </Card>
    </div>
  );
}
