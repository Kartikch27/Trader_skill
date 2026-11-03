import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, Search, SearchX } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync, useMode, useNow, useT } from '../state/hooks';
import { Banner, Card, DataGate, Empty, PageHeader, Pill, Segmented, Term } from '../components/ui';
import { compact, count, pct, price as fp } from '../domain/format';
import { demoInstant } from '../domain/market';
import type { ScanHit, ScanResult, SetupId } from '../domain/types';
import type { Key } from '../i18n/dict';

export const cleanName = (n?: string | null) =>
  (n ?? '').replace(/\s+-\s+.*$/, '').replace(/\s+(Common Stock|Ordinary Shares|Class [A-C].*|Common Shares.*)$/i, '').trim();

type Sort = 'time' | 'over' | 'change' | 'volume' | 'symbol' | 'rsi';

export function whyText(t: ReturnType<typeof useT>, h: ScanHit, setup: SetupId) {
  if (setup === 'orb') return t('why.orb', { start: h.bar_start ?? '', at: h.at ?? '', price: fp(h.price), over: pct(h.pct_over), high: fp(h.or_high) });
  if (setup === 'oversold') return t('why.oversold', { rsi: h.rsi?.toFixed(1) ?? '—' });
  return t(`why.${setup}` as Key, { price: fp(h.price) });
}

export function FindStocks() {
  const t = useT();
  const mode = useMode();
  const nav = useNavigate();
  const scanMode = useStore((s) => s.scanMode);
  const setScanMode = useStore((s) => s.setScanMode);
  const watchlist = useStore((s) => s.watchlist);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const selectSymbol = useStore((s) => s.selectSymbol);
  const sim = useStore((s) => s.prefs.sim);
  const now = useNow();
  const scan = useAsync((svc) => svc.scan(scanMode), [scanMode]);
  const info = useAsync((svc) => svc.info(), []);
  const [q, setQ] = useState('');
  const [setup, setSetup] = useState<'all' | SetupId>('all');
  const [minPrice, setMinPrice] = useState(5);
  const [sort, setSort] = useState<Sort>('time');

  const staleMin = info.status === 'ready' ? Math.round(((now.demo ? demoInstant(now.time).getTime() : Date.now()) - Date.parse(info.data.asOf)) / 60000) : 0;

  const open = (sym: string) => { selectSymbol(sym); nav('/workspace/context'); };

  return (
    <div className="space-y-4">
      <PageHeader title={t('find.title')} subtitle={t('find.subtitle')} />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label={t('find.scanType')} value={scanMode} onChange={(v) => { setScanMode(v); setSetup('all'); setSort(v === 'orb' ? 'time' : 'volume'); }} options={[{ value: 'orb', label: t('find.orb') }, { value: 'daily', label: t('find.daily') }]} />
      </div>
      <DataGate state={scan} lines={6}>
        {(r) => (
          <Results r={r} t={t} mode={mode} q={q} setQ={setQ} setup={setup} setSetup={setSetup} minPrice={minPrice} setMinPrice={setMinPrice}
            sort={sort} setSort={setSort} watchlist={watchlist} toggleWatch={toggleWatch} open={open} stale={sim === 'stale' || staleMin > 15 ? staleMin : null} />
        )}
      </DataGate>
    </div>
  );
}

function Results(p: {
  r: ScanResult; t: ReturnType<typeof useT>; mode: 'beginner' | 'pro'; q: string; setQ: (s: string) => void; setup: 'all' | SetupId; setSetup: (s: 'all' | SetupId) => void;
  minPrice: number; setMinPrice: (n: number) => void; sort: Sort; setSort: (s: Sort) => void; watchlist: string[]; toggleWatch: (s: string) => void; open: (s: string) => void; stale: number | null;
}) {
  const { r, t, mode } = p;
  const setups = useMemo(() => Array.from(new Set(r.hits.flatMap((h) => h.setups))) as SetupId[], [r]);
  const hits = useMemo(() => {
    const qq = p.q.trim().toLowerCase();
    let h = r.hits.filter((x) => (p.setup === 'all' || x.setups.includes(p.setup)) && x.price >= p.minPrice && (!qq || x.symbol.toLowerCase().includes(qq) || (x.name ?? '').toLowerCase().includes(qq)));
    const by: Record<Sort, (a: ScanHit, b: ScanHit) => number> = {
      time: (a, b) => (a.bar_index ?? 0) - (b.bar_index ?? 0) || a.symbol.localeCompare(b.symbol),
      over: (a, b) => (b.pct_over ?? 0) - (a.pct_over ?? 0),
      change: (a, b) => (b.change_pct ?? -1e9) - (a.change_pct ?? -1e9),
      volume: (a, b) => ((b.volume_so_far ?? b.volume ?? 0) * b.price) - ((a.volume_so_far ?? a.volume ?? 0) * a.price),
      symbol: (a, b) => a.symbol.localeCompare(b.symbol),
      rsi: (a, b) => (a.rsi ?? 100) - (b.rsi ?? 100),
    };
    h = [...h].sort(by[p.sort]);
    return h;
  }, [r, p.q, p.setup, p.minPrice, p.sort]);

  const sortOpts: { value: Sort; key: Key }[] = r.mode === 'orb'
    ? [{ value: 'time', key: 'find.sort.time' }, { value: 'over', key: 'find.sort.over' }, { value: 'change', key: 'find.sort.change' }, { value: 'volume', key: 'find.sort.volume' }, { value: 'symbol', key: 'find.sort.symbol' }]
    : [{ value: 'volume', key: 'find.sort.volume' }, { value: 'change', key: 'find.sort.change' }, { value: 'rsi', key: 'find.sort.rsi' }, { value: 'symbol', key: 'find.sort.symbol' }];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted num">{t('find.coverage', { scanned: count(r.scanned), universe: count(r.universe), failed: count(r.failed), asOf: r.as_of })}</p>
      {r.data_note && mode === 'pro' && <p className="text-xs text-muted">{r.data_note}</p>}
      {r.failed > 0 && <Banner tone="warn" title={t('state.partial', { got: count(r.universe - r.failed), total: count(r.universe), failed: count(r.failed) })} />}
      {p.stale != null && <Banner tone="warn" title={t('state.stale', { age: `${p.stale} min` })} />}
      <Banner tone="info">{t('match.notAdvice')} {r.mode === 'orb' && t('find.staleHit')}</Banner>

      <div className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="fs-q" className="sr-only">{t('common.search')}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input id="fs-q" className="input pl-9" placeholder={t('find.searchPh')} value={p.q} onChange={(e) => p.setQ(e.target.value)} />
        </div>
        <div>
          <label htmlFor="fs-setup" className="sr-only">{t('find.filterSetup')}</label>
          <select id="fs-setup" className="input" value={p.setup} onChange={(e) => p.setSetup(e.target.value as SetupId | 'all')}>
            <option value="all">{t('find.filterSetup')}: {t('common.all')}</option>
            {setups.map((s) => <option key={s} value={s}>{t(`setup.${s}` as Key)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fs-min" className="sr-only">{t('find.minPrice')}</label>
          <select id="fs-min" className="input" value={p.minPrice} onChange={(e) => p.setMinPrice(Number(e.target.value))}>
            {[5, 20, 50, 100].map((n) => <option key={n} value={n}>{t('find.minPrice')}: ${n}+</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fs-sort" className="sr-only">{t('find.sort')}</label>
          <select id="fs-sort" className="input" value={p.sort} onChange={(e) => p.setSort(e.target.value as Sort)}>
            {sortOpts.map((o) => <option key={o.value} value={o.value}>{t('find.sort')}: {t(o.key)}</option>)}
          </select>
        </div>
      </div>

      <p className="text-sm font-medium" aria-live="polite">{t('find.results', { n: hits.length })}</p>

      {r.hits.length === 0 ? (
        <Card><Empty icon={SearchX} title={t('state.empty')} hint={t('state.emptyHint')} /></Card>
      ) : hits.length === 0 ? (
        <Card><Empty icon={SearchX} title={t('find.results', { n: 0 })} hint={`${t('find.filterSetup')} / ${t('find.minPrice')} / ${t('common.search')}`} /></Card>
      ) : mode === 'pro' ? (
        <div className="card overflow-x-auto">
          <table className="table-pro w-full min-w-[760px]">
            <caption className="sr-only">{t('find.title')}</caption>
            <thead className="border-b border-line">
              <tr><th>Symbol</th><th>Setup</th><th className="text-right">Price</th><th className="text-right">Chg</th>{r.mode === 'orb' ? <><th className="text-right">Range</th><th className="text-right">Over</th><th>At</th><th className="text-right">Vol so far</th></> : <><th className="text-right">RSI</th><th className="text-right">Volume</th><th>Close</th></>}<th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {hits.map((h) => (
                <tr key={h.symbol} className="border-b border-line last:border-0 hover:bg-sunken/60">
                  <td><button className="font-semibold text-primary hover:underline" onClick={() => p.open(h.symbol)}>{h.symbol}</button><div className="max-w-[180px] truncate text-xs text-muted">{cleanName(h.name)}</div></td>
                  <td className="text-xs">{h.setups.map((s) => t(`setup.${s}` as Key)).join(', ')}</td>
                  <td className="text-right">{fp(h.price)}</td>
                  <td className={`text-right ${(h.change_pct ?? 0) >= 0 ? 'text-pos' : 'text-neg'}`}>{pct(h.change_pct)}</td>
                  {r.mode === 'orb' ? <><td className="text-right text-muted">{fp(h.or_low)}–{fp(h.or_high)}</td><td className="text-right">{pct(h.pct_over)}</td><td>{h.at}</td><td className="text-right">{compact(h.volume_so_far)}</td></> : <><td className="text-right">{h.rsi?.toFixed(1)}</td><td className="text-right">{compact(h.volume)}</td><td>{h.close_date}</td></>}
                  <td className="text-right"><WatchBtn sym={h.symbol} on={p.watchlist.includes(h.symbol)} toggle={p.toggleWatch} t={t} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {hits.map((h) => (
            <li key={h.symbol} className="card card-pad flex min-w-0 flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{h.symbol}</p>
                  <p className="truncate text-sm text-muted">{cleanName(h.name) || '—'}</p>
                </div>
                <div className="shrink-0 text-right num">
                  <p className="text-lg font-semibold">{fp(h.price)}</p>
                  <p className={`text-sm ${(h.change_pct ?? 0) >= 0 ? 'text-pos' : 'text-neg'}`}>{pct(h.change_pct)} <span className="block text-xs text-muted">{t('find.change')}</span></p>
                  <p className="text-xs text-muted">{h.price_time}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {h.setups.map((s) => <Pill key={s} tone="info">{t('match.label', { setup: t(`setup.${s}` as Key) })}</Pill>)}
                <Pill tone="muted">{t('find.complete')}</Pill>
              </div>
              <div className="space-y-1 text-sm">
                {h.setups.map((s) => <p key={s}>{whyText(t, h, s)}</p>)}
                <p className="text-xs text-muted num">
                  {r.mode === 'orb' ? <>{t('find.volSoFar')}: {compact(h.volume_so_far)} · <Term k="range" />: {fp(h.or_low)}–{fp(h.or_high)}</> : <>{t('find.volume')}: {compact(h.volume)} · <Term k="rsi" /> {h.rsi?.toFixed(1)}</>}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <button className="btn-primary flex-1" onClick={() => p.open(h.symbol)}>{t('find.view')}</button>
                <WatchBtn sym={h.symbol} on={p.watchlist.includes(h.symbol)} toggle={p.toggleWatch} t={t} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t('find.noDemoChart')}</p>
    </div>
  );
}

function WatchBtn({ sym, on, toggle, t, compact: c }: { sym: string; on: boolean; toggle: (s: string) => void; t: ReturnType<typeof useT>; compact?: boolean }) {
  return (
    <button className={c ? 'btn-ghost min-h-[32px] px-2 text-xs' : 'btn-secondary'} aria-pressed={on} onClick={() => toggle(sym)} aria-label={`${on ? t('find.added') : t('find.add')}: ${sym}`}>
      {on ? <Check aria-hidden className="h-4 w-4 text-pos" /> : <Plus aria-hidden className="h-4 w-4" />}
      {!c && (on ? t('find.added') : t('find.add'))}
    </button>
  );
}
