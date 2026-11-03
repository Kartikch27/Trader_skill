import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellPlus, Clock } from 'lucide-react';
import { useStore } from '../../state/store';
import { useMode, useNow, useT } from '../../state/hooks';
import { Advanced, Banner, Card, DataGate, Field, NumberInput, Pill, Term, type Tone } from '../../components/ui';
import { PriceChart } from '../../components/PriceChart';
import { watchEntry, type EntryStatus } from '../../domain/entryWatch';
import { hhmmToMin, minToHhmm } from '../../domain/market';
import { clock12, pct, price as fp } from '../../domain/format';
import { useBars, useScanHits, PLAN_DAY } from './shared';
import type { Bar } from '../../domain/types';
import type { Key } from '../../i18n/dict';

const TONE: Record<EntryStatus, Tone> = { waiting: 'info', triggered: 'pos', expired: 'muted', no_data: 'warn', not_open: 'muted', range_forming: 'info' };

export function EntryStep({ symbol }: { symbol: string }) {
  const t = useT();
  const nav = useNavigate();
  const bars = useBars(symbol);
  const hits = useScanHits(symbol);
  return (
    <DataGate state={bars} lines={6}>
      {(b) => {
        if (b) return <EntryWatch symbol={symbol} today={b.today} />;
        const orb = hits.status === 'ready' ? hits.data.find((h) => h.mode === 'orb')?.hit : undefined;
        return (
          <Card title={t('entry.title')}>
            {orb ? (
              <div className="space-y-2 text-sm">
                <Pill tone="pos">{t('entry.status.triggered')}</Pill>
                <p>{t('entry.triggered.detail', { time: orb.at ?? '', start: orb.bar_start ?? '', price: fp(orb.price), over: pct(orb.pct_over), level: fp(orb.or_high) })}</p>
                <p className="text-xs text-muted">From the scanner's confirmed candle (real highs and lows). The demo has no candle-by-candle chart for {symbol}.</p>
                <button className="btn-primary" onClick={() => nav('/workspace/exit')}>{t('entry.toExit')}</button>
              </div>
            ) : (
              <div className="space-y-2 text-sm"><Pill tone="warn">{t('entry.status.no_data')}</Pill><p>{t('entry.noData.detail')}</p></div>
            )}
          </Card>
        );
      }}
    </DataGate>
  );
}

function EntryWatch({ symbol, today }: { symbol: string; today: Bar[] }) {
  const t = useT();
  const mode = useMode();
  const nav = useNavigate();
  const now = useNow();
  const clock = useStore((s) => s.demoClock);
  const setClock = useStore((s) => s.setDemoClock);
  const config = useStore((s) => s.config);
  const addAlerts = useStore((s) => s.addAlerts);
  const alerts = useStore((s) => s.alerts);
  const [minVolX, setMinVolX] = useState<number | undefined>(undefined);
  const [level, setLevel] = useState<number | undefined>(undefined);

  const nowMin = now.demo ? hhmmToMin(clock) : now.minutes;
  const r = useMemo(
    () => watchEntry({ bars: today, nowMinutes: nowMin, noEntriesAfter: config.no_entries_after, minVolumeX: minVolX ?? null, level: level ?? null }),
    [today, nowMin, config.no_entries_after, minVolX, level],
  );
  const shown = useMemo(() => today.filter((x) => hhmmToMin(x.ny.slice(11, 16)) + 5 <= nowMin), [today, nowMin]);
  const lvl = r.level;
  const lines = useMemo(() => [
    ...(lvl != null ? [{ price: lvl, label: level ? 'Your level' : 'Range high (level)', tone: 'level' as const }] : []),
    ...(r.range ? [{ price: r.range.low, label: 'Range low', tone: 'stop' as const }] : []),
  ], [lvl, level, r.range]);
  const late = r.trigger ? r.barsClosed - (r.trigger.barIndex + 1) : 0;
  const alertId = lvl != null ? `${symbol.toLowerCase()}-entry-${lvl}` : '';
  const alerted = alerts.some((a) => a.id === alertId);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Card title={t('entry.title')}>
          <div className="space-y-3 text-sm" aria-live="polite">
            <Pill tone={TONE[r.status]}>{t(`entry.status.${r.status}` as Key)}</Pill>
            {lvl != null && <p className="font-medium">{t('entry.condition', { level: fp(lvl) })}</p>}
            {r.range && <p className="text-muted num">{t('entry.range', { low: fp(r.range.low), high: fp(r.range.high), bars: r.range.bars, of: r.range.of })} · <Term k="range" /></p>}

            {r.status === 'waiting' && r.lastClosed && lvl != null && (
              <>
                <p>{t('entry.waiting.detail', { start: r.lastClosed.start, close: fp(r.lastClosed.close), gap: `${fp(Math.abs(lvl - r.lastClosed.close))} (${pct(r.lastClosed.vsLevelPct)})`, dir: r.lastClosed.close <= lvl ? t('entry.dir.under') : t('entry.dir.over'), level: fp(lvl) })}</p>
                <Banner tone="info" title={t('entry.missing', { level: fp(lvl) })}>{t('entry.notYetEn')}</Banner>
              </>
            )}
            {r.status === 'triggered' && r.trigger && lvl != null && (
              <>
                <p>{t('entry.triggered.detail', { time: r.trigger.time, start: r.trigger.barStart, price: fp(r.trigger.price), over: pct(r.trigger.overPct), level: fp(lvl) })}</p>
                {late > 0 && <Banner tone="warn">{t('entry.late', { n: late })}</Banner>}
                <Banner tone="muted">{t('entry.notOrder')}</Banner>
              </>
            )}
            {r.status === 'expired' && <p>{t('entry.expired.detail', { cutoff: config.no_entries_after ?? '15:30' })}</p>}
            {r.status === 'no_data' && <p>{t('entry.noData.detail')}</p>}
            {r.forming && (r.status === 'waiting' || r.status === 'range_forming') && (
              <p className="flex items-start gap-1.5 text-xs text-muted"><Clock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t('entry.forming', { start: r.forming.start, closes: r.forming.closesAt })} <Term k="candle" /></span></p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {r.status === 'triggered'
              ? <button className="btn-primary" onClick={() => nav('/workspace/exit')}>{t('entry.toExit')}</button>
              : lvl != null && (
                <button className="btn-primary" disabled={alerted} onClick={() => addAlerts([{ id: alertId, symbol, type: 'above', price: lvl, note: 'entry level (a price alert, not a candle close)', date: PLAN_DAY }])}>
                  <BellPlus aria-hidden className="h-4 w-4" />{alerted ? t('al.added', { n: 1 }) : t('entry.setAlert', { level: fp(lvl) })}
                </button>
              )}
          </div>

          <Advanced defaultOpen={mode === 'pro'}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field htmlFor="en-lvl" label="Level instead of range high" hint="A level setup, like a 20-day high.">
                <NumberInput id="en-lvl" value={level} onChange={setLevel} prefix="$" />
              </Field>
              <Field htmlFor="en-vol" label="Min volume (× range average)" hint="1.0 is already strict: the 9:30 candle holds the opening auction.">
                <NumberInput id="en-vol" value={minVolX} onChange={setMinVolX} step={0.1} min={0} />
              </Field>
            </div>
          </Advanced>
        </Card>

        {now.demo && (
          <Card title={t('entry.scrub')}>
            <label htmlFor="clock" className="sr-only">{t('entry.scrub')}</label>
            <input id="clock" type="range" min={hhmmToMin('09:25')} max={hhmmToMin('10:15')} step={1} value={hhmmToMin(clock)} onChange={(e) => setClock(minToHhmm(Number(e.target.value)))} className="w-full accent-[rgb(var(--primary))]" aria-valuetext={`${clock12(clock)} New York`} />
            <div className="mt-1 flex justify-between text-xs text-muted num"><span>9:25 AM</span><span className="font-medium text-ink">{clock12(clock)} ET</span><span>10:15 AM</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['09:40', '10:12', '10:15'].map((c) => <button key={c} className="btn-secondary min-h-[32px] px-2.5 text-xs" aria-pressed={clock === c} onClick={() => setClock(c)}>{clock12(c)}</button>)}
            </div>
            <p className="mt-2 text-xs text-muted">Saved candles end at 10:15 AM. At 10:12 the 10:10 candle is still forming, so it does not count yet.</p>
          </Card>
        )}
      </div>
      <Card title={t('ctx.chart')} className="lg:col-span-3">
        {shown.length ? <PriceChart bars={shown} lines={lines} label={`${symbol} completed 5-minute candles to ${clock12(minToHhmm(nowMin))}`} height={mode === 'pro' ? 400 : 320} /> : <p className="text-sm text-muted">{t('entry.status.not_open')}</p>}
        <p className="mt-2 text-xs text-muted">Only completed candles are drawn. {t('state.delayed')}</p>
      </Card>
    </div>
  );
}
