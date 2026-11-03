import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Clock, Eye } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync, useMode, useNow, useT } from '../state/hooks';
import { useJourney } from '../state/journey';
import { Card, DataGate, Pill, Stat, Term, PageHeader } from '../components/ui';
import { session } from '../domain/market';
import { clock12, count, money, nyDateTime, pct, signedMoney } from '../domain/format';
import { watchEntry } from '../domain/entryWatch';
import { hhmmToMin } from '../domain/market';
import quotes from '../fixtures/quotes.json';
import type { Bar, Quote } from '../domain/types';
import type { Key } from '../i18n/dict';

const Q = quotes.quotes as Record<string, Quote>;

export function Overview() {
  const t = useT();
  const mode = useMode();
  const now = useNow();
  const s = session(now);
  const cash = useStore((x) => x.cash);
  const realized = useStore((x) => x.realized);
  const positions = useStore((x) => x.positions);
  const watchlist = useStore((x) => x.watchlist);
  const alertLog = useStore((x) => x.alertLog);
  const config = useStore((x) => x.config);
  const symbol = useStore((x) => x.symbol);
  const j = useJourney();
  const info = useAsync((svc) => svc.info(), []);
  const bars = useAsync((svc) => svc.bars('TSLA'), []);

  const unrealized = positions.reduce((a, p) => a + p.qty * ((Q[p.symbol]?.price ?? p.avgPrice) - p.avgPrice), 0);
  const posValue = positions.reduce((a, p) => a + p.qty * (Q[p.symbol]?.price ?? p.avgPrice), 0);
  const lossLimit = config.max_daily_loss_usd;
  const used = j.lossUsed;
  const usedPct = lossLimit ? Math.min(100, (used / lossLimit) * 100) : 0;

  const phaseKey: Record<string, Key> = { open: 'ov.session.open', pre_market: 'ov.session.pre', after_close: 'ov.session.after', closed_weekend: 'ov.session.weekend', unknown_calendar: 'ov.session.unknown' };

  const next = !symbol ? null : !j.plan ? { step: 'entry', key: 'ws.step.entry' as Key } : !j.active ? { step: 'replay', key: 'ws.step.replay' as Key } : j.active.state === 'checked' || j.active.state === 'proposed' || j.active.state === 'blocked' ? { step: 'review', key: 'ws.step.review' as Key } : { step: 'review', key: 'ws.step.review' as Key };

  return (
    <div className="space-y-5">
      <PageHeader title={t('ov.title')} subtitle={t('app.tagline')} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('ov.session')}>
          <div className="flex items-center gap-2">
            <Pill tone={s.phase === 'open' ? 'pos' : 'muted'} icon={Clock}>{s.phase === 'closed_holiday' ? t('ov.session.holiday', { name: s.holiday ?? '' }) : t(phaseKey[s.phase])}</Pill>
          </div>
          <p className="mt-2 text-2xl font-semibold num">{clock12(now.time)} <span className="text-sm font-normal text-muted">ET · New York</span></p>
          <p className="mt-1 text-xs text-muted">{now.date} · {t('ov.session.hours', { close: s.earlyClose ? '1:00 p.m.' : '4:00 p.m.' })}</p>
          {now.demo && <p className="mt-2 text-xs text-warn">{t('demo.clock', { time: clock12(now.time) })}</p>}
        </Card>
        <Card title={t('ov.account')}>
          <Pill tone="info">{t('badge.paper')}</Pill>
          <p className="mt-2 text-sm text-muted"><Term k="paper" /></p>
          <p className="mt-2 text-xs text-muted">{t('set.liveDisabled')}</p>
        </Card>
        <Card title={t('ov.dataSource')}>
          <DataGate state={info} lines={2}>
            {(i) => (
              <div className="space-y-1.5 text-sm">
                <Pill tone={i.source === 'demo' ? 'warn' : 'pos'}>{i.source === 'demo' ? t('badge.demo') : t('badge.connected')}</Pill>
                <p className="text-muted">{i.provider}</p>
                <p className="text-xs text-muted">{t('common.asOf', { time: nyDateTime(i.asOf) })} · {t('state.delayed')}</p>
              </div>
            )}
          </DataGate>
        </Card>
      </div>

      <Card>
        <div className={`grid gap-5 ${mode === 'pro' ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
          <Stat label={t('ov.cash')} value={money(cash)} help={mode === 'beginner' ? t('ov.cash.help') : undefined} />
          <Stat label={t('ov.positions')} value={count(positions.length)} sub={positions.length ? money(posValue) : undefined} />
          <Stat label={<Term k="unrealized" />} value={signedMoney(unrealized)} tone={unrealized > 0 ? 'pos' : unrealized < 0 ? 'neg' : undefined} sub={positions.length ? `demo price ${nyDateTime(Q.TSLA.time)}` : undefined} />
          <Stat label={<Term k="realized" />} value={signedMoney(realized)} tone={realized > 0 ? 'pos' : realized < 0 ? 'neg' : undefined} />
          <div className={mode === 'pro' ? '' : 'sm:col-span-2 lg:col-span-4'}>
            <div className="text-xs font-medium text-muted"><Term k="dailyLoss">{t('ov.dailyUsed')}</Term></div>
            <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-semibold num">{money(used)}</span><span className="text-sm text-muted num">/ {money(lossLimit)}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={lossLimit} aria-valuenow={used} aria-label={t('ov.dailyUsed')}>
              <div className={`h-full ${usedPct >= 100 ? 'bg-neg' : usedPct > 66 ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${usedPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted num">{t('ov.dailyRemaining', { left: money(Math.max(0, lossLimit - used)), limit: money(lossLimit) })}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('ov.continue')}>
          {symbol ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{symbol}</p>
                <p className="text-sm text-muted">{j.plan ? t('ws.planVersion', { v: j.plan.version, time: nyDateTime(j.plan.savedAt) }) : t('ov.continue.none')}</p>
                {next && <p className="mt-1 text-sm">{t('ov.continue.step', { step: t(next.key) })}</p>}
              </div>
              <Link className="btn-primary" to={`/workspace/${next?.step ?? 'context'}`}>{t('nav.workspace')}<ArrowRight aria-hidden className="h-4 w-4" /></Link>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted">{t('ov.continue.none')}</p><Link className="btn-primary" to="/find">{t('ov.startScan')}</Link></div>
          )}
        </Card>

        <Card title={t('ov.monitored')}>
          <DataGate state={bars} lines={2}>
            {(b) => {
              const today = (b?.bars ?? []).filter((x: Bar) => x.ny.startsWith('2026-10-19'));
              return watchlist.length ? (
                <ul className="divide-y divide-line">
                  {watchlist.map((sym) => {
                    const r = sym === 'TSLA' ? watchEntry({ bars: today, nowMinutes: hhmmToMin(now.time), noEntriesAfter: config.no_entries_after }) : null;
                    return (
                      <li key={sym} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="flex items-center gap-2 font-medium"><Eye aria-hidden className="h-4 w-4 text-muted" />{sym}</span>
                        {r ? <span className="flex items-center gap-2"><Pill tone={r.status === 'triggered' ? 'pos' : r.status === 'waiting' ? 'info' : 'muted'}>{t(`entry.status.${r.status}` as Key)}</Pill>{r.level != null && <span className="num text-muted">&gt; {r.level.toFixed(2)}</span>}</span> : <Pill tone="muted">{t('entry.status.no_data')}</Pill>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-muted">{t('ov.watchlist.empty')}</p>;
            }}
          </DataGate>
        </Card>

        <Card title={t('ov.watchlist')} actions={<Link to="/find" className="text-sm font-medium text-primary hover:underline">{t('nav.find')}</Link>}>
          {watchlist.length ? (
            <ul className="divide-y divide-line">
              {watchlist.map((sym) => {
                const q = Q[sym];
                const ch = q?.prev_close ? (q.price / q.prev_close - 1) * 100 : null;
                return (
                  <li key={sym} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{sym}</span>
                    {q ? <span className="num">{q.price.toFixed(2)} <span className={ch != null && ch >= 0 ? 'text-pos' : 'text-neg'}>{pct(ch)}</span> <span className="text-xs text-muted">{nyDateTime(q.time)}</span></span> : <span className="text-xs text-muted">no demo quote</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">{t('ov.watchlist.empty')}</p>}
        </Card>

        <Card title={t('ov.recentAlerts')} actions={<Link to="/alerts" className="text-sm font-medium text-primary hover:underline">{t('nav.alerts')}</Link>}>
          {alertLog.length ? (
            <ul className="space-y-2">
              {alertLog.slice(0, 5).map((a, i) => (
                <li key={`${a.id}-${i}`} className="flex items-start gap-2 text-sm"><Bell aria-hidden className="mt-0.5 h-4 w-4 text-warn" /><span><span className="num text-xs text-muted">{a.at.replace('T', ' ')} ET · </span>{a.message}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{t('al.none')}</p>}
        </Card>
      </div>
    </div>
  );
}
