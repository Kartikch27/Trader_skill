import { Link } from 'react-router-dom';
import { ExternalLink, Newspaper, TrendingUp } from 'lucide-react';
import { useAsync, useMode, useT } from '../../state/hooks';
import { Banner, Card, DataGate, FactTag, Pill, Term } from '../../components/ui';
import { PriceChart } from '../../components/PriceChart';
import { nyDateTime, pct, price as fp, compact } from '../../domain/format';
import { useBars, useScanHits } from './shared';
import { whyText, cleanName } from '../FindStocks';
import type { Key } from '../../i18n/dict';

export function ContextStep({ symbol }: { symbol: string }) {
  const t = useT();
  const mode = useMode();
  const hits = useScanHits(symbol);
  const bars = useBars(symbol);
  const news = useAsync((svc) => svc.news(symbol), [symbol]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card title={t('ctx.whyEn')} id="why">
          <DataGate state={hits} lines={3}>
            {(hs) => hs.length ? (
              <div className="space-y-4">
                {hs.map(({ mode: m, hit, asOf }) => (
                  <div key={m} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {hit.setups.map((s) => <Pill key={s} tone="info">{t('match.label', { setup: t(`setup.${s}` as Key) })}</Pill>)}
                      <FactTag kind="fact" />
                    </div>
                    {hit.name && <p className="text-sm text-muted">{cleanName(hit.name)}</p>}
                    <ul className="space-y-1 text-sm">
                      {hit.setups.map((s) => <li key={s}>{whyText(t, hit, s)}</li>)}
                    </ul>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <div><dt className="text-muted">Price</dt><dd className="num font-medium">{fp(hit.price)}</dd></div>
                      <div><dt className="text-muted">{t('find.change')}</dt><dd className={`num font-medium ${(hit.change_pct ?? 0) >= 0 ? 'text-pos' : 'text-neg'}`}>{pct(hit.change_pct)}</dd></div>
                      {m === 'orb' ? <div><dt className="text-muted"><Term k="range" /></dt><dd className="num font-medium">{fp(hit.or_low)}–{fp(hit.or_high)}</dd></div> : <div><dt className="text-muted"><Term k="rsi" /></dt><dd className="num font-medium">{hit.rsi?.toFixed(1)}</dd></div>}
                      <div><dt className="text-muted">Data</dt><dd className="num">{asOf}</dd></div>
                    </dl>
                  </div>
                ))}
                <p className="text-xs text-muted">{t('match.notAdvice')}</p>
              </div>
            ) : <p className="text-sm text-muted">{symbol}: no scanner match in the saved scans. You can still plan it.</p>}
          </DataGate>
        </Card>

        <Card title={t('ctx.chart')}>
          <DataGate state={bars} lines={8}>
            {(b) => b ? (
              <PriceChart bars={b.all} label={`${symbol} 5-minute candles`} height={mode === 'pro' ? 380 : 300}
                lines={b.today.length >= 3 ? [{ price: Math.max(...b.today.slice(0, 3).map((x) => x.h)), label: 'Range high', tone: 'level' }, { price: Math.min(...b.today.slice(0, 3).map((x) => x.l)), label: 'Range low', tone: 'level' }] : []} />
            ) : <p className="text-sm text-muted">{t('find.noDemoChart')}</p>}
          </DataGate>
          <p className="mt-2 text-xs text-muted">{t('state.delayed')} {bars.status === 'ready' && bars.data ? `Complete candles through ${bars.data.completeThrough}.` : ''}</p>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card title={<span className="flex items-center gap-2"><Newspaper aria-hidden className="h-4 w-4" />{t('ctx.news')}</span>}>
          <DataGate state={news} lines={5}>
            {(n) => (
              <div className="space-y-3">
                {n.moves.map((mv) => (
                  <Banner key={mv.ticker} tone={mv.moving ? 'warn' : 'muted'}>
                    <span className="flex items-center gap-1.5"><TrendingUp aria-hidden className="h-4 w-4" />{t('ctx.moving', { pct: pct(mv.pct), prev: fp(mv.prev_close), time: nyDateTime(mv.time) })}</span>
                  </Banner>
                ))}
                {n.items.some((i) => i.tags.includes('earnings')) && (
                  <div className="rounded-lg border border-info/30 bg-info-soft p-3 text-sm"><FactTag kind="explain" /><p className="mt-1">{t('ctx.earningsNote', { symbol })}</p></div>
                )}
                <p className="text-xs text-muted">{t('ctx.newsNote')}</p>
                {n.items.length === 0 ? <p className="text-sm text-muted">{t('ctx.noNews', { symbol })}{n.notes.length ? ` ${n.notes.join(' ')}` : ''}</p> : (
                  <ul className="divide-y divide-line">
                    {[...n.items].sort((a, b) => b.time.localeCompare(a.time)).slice(0, mode === 'pro' ? 20 : 8).map((i) => (
                      <li key={i.id} className="py-2.5">
                        <a href={i.link} target="_blank" rel="noreferrer noopener" className="group block">
                          <span className="text-sm font-medium group-hover:underline">{i.title}</span>
                          <ExternalLink aria-hidden className="ml-1 inline h-3 w-3 text-muted" />
                          <span className="sr-only"> ({t('common.openLink')})</span>
                        </a>
                        <p className="mt-0.5 text-xs text-muted">{i.source} · {nyDateTime(i.time)}{i.tags.length ? ` · ${i.tags.join(', ')}` : ''}</p>
                        {mode === 'pro' && i.summary && <p className="mt-1 text-xs text-muted">{i.summary}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </DataGate>
        </Card>
        <Link to="/workspace/entry" className="btn-primary w-full">{t('ws.step.entry')}</Link>
        {mode === 'pro' && <p className="text-xs text-muted">Volume and price are from saved Yahoo charts; volume so far: {hits.status === 'ready' ? compact(hits.data[0]?.hit.volume_so_far ?? hits.data[0]?.hit.volume) : '—'}.</p>}
      </div>
    </div>
  );
}
