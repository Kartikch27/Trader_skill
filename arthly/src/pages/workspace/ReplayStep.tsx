import { Link, useNavigate } from 'react-router-dom';
import { History, Shuffle } from 'lucide-react';
import { useStore } from '../../state/store';
import { useAsync, useMode, useT } from '../../state/hooks';
import { Banner, Card, DataGate, Empty, FactTag, Pill, Term } from '../../components/ui';
import { CloseHistogram, FanChart, OutcomeBars } from '../../components/ReplayCharts';
import { computeExit } from '../../domain/exitPlan';
import { count, pctOf, price as fp } from '../../domain/format';
import type { ReplayResult } from '../../domain/types';

export function ReplayStep({ symbol }: { symbol: string }) {
  const t = useT();
  const plan = useStore((s) => s.plan);
  if (!plan || plan.inputs.symbol !== symbol) {
    return <Card><Empty title={t('ws.needPlan')} hint="Save an exit plan first; the replay runs on a saved plan." action={<Link className="btn-primary" to="/workspace/exit">{t('ws.step.exit')}</Link>} /></Card>;
  }
  return <ReplayBody symbol={symbol} />;
}

function ReplayBody({ symbol }: { symbol: string }) {
  const t = useT();
  const mode = useMode();
  const nav = useNavigate();
  const plan = useStore((s) => s.plan)!;
  const savePlan = useStore((s) => s.savePlan);
  const rep = useAsync((svc) => svc.replay({ symbol, date: plan.inputs.date, entry: plan.calc.entry, stop: plan.calc.stop, target: plan.calc.target }), [symbol, plan.version]);

  return (
    <DataGate state={rep} lines={8}>
      {(r) => {
        if (!r) return <Card><Empty title={t('replay.unavailable', { symbol })} hint={t('replay.needsBackend')} /></Card>;
        const matches = r.plan.entry === plan.calc.entry && r.plan.stop === plan.calc.stop && r.plan.target === plan.calc.target;
        const useReplayed = () => {
          const inputs = { ...plan.inputs, entry: r.plan.entry, stopRule: r.plan.stop_rule, stopValue: undefined, targetRule: 'r' as const, targetValue: r.plan.target_r };
          const c = computeExit({ entry: inputs.entry, stopRule: inputs.stopRule, targetRule: 'r', targetValue: inputs.targetValue, openingRange: inputs.openingRange, entryTime: inputs.entryTime, flatBy: inputs.flatBy });
          if (c.ok) savePlan(inputs, c.plan);
        };
        return (
          <div className="space-y-4">
            <Banner tone="info" title={t('replay.disclaimer')} />
            {!matches && (
              <Banner tone="warn" title={t('replay.outdated', { v: plan.version, e: fp(r.plan.entry), s: fp(r.plan.stop), t: fp(r.plan.target) })}
                action={<button className="btn-secondary shrink-0" onClick={useReplayed}>{t('replay.restore')}</button>}>
                {t('replay.needsBackend')}
              </Banner>
            )}
            <div className={`grid gap-4 lg:grid-cols-2 ${!matches ? 'opacity-60' : ''}`} aria-hidden={!matches || undefined}>
              <Simulated r={r} mode={mode} />
              <Historical r={r} mode={mode} />
            </div>
            <Card title={t('replay.verdict')}>
              <div className="flex items-start gap-2"><FactTag kind="fact" /><div className="space-y-1">
                <p className="font-medium">{r.verdict}</p>
                {r.verdict_notes.map((n) => <p key={n} className="text-sm text-muted">{n}</p>)}
                {r.warnings.map((w) => <p key={w} className="text-sm text-warn">{w}</p>)}
              </div></div>
              <p className="mt-3 text-xs text-muted">{r.note}</p>
            </Card>
            <Card title={<Term k="band">{t('replay.fan')}</Term>}><FanChart r={r} /></Card>
            {mode === 'pro' && <Card><CloseHistogram r={r} /></Card>}
            <div className="flex justify-end"><button className="btn-primary" disabled={!matches} onClick={() => nav('/workspace/size')}>{t('ws.step.size')}</button></div>
          </div>
        );
      }}
    </DataGate>
  );
}

function Simulated({ r, mode }: { r: ReplayResult; mode: 'beginner' | 'pro' }) {
  const t = useT();
  const m = r.mc;
  return (
    <Card title={<span className="flex items-center gap-2"><Shuffle aria-hidden className="h-4 w-4" />{t('replay.sim')}</span>} actions={<Pill tone="muted">model</Pill>}>
      <OutcomeBars mc={m} />
      <div className="mt-4 space-y-1.5 text-sm">
        <p className="num">{t('replay.close', { until: m.until, med: fp(m.median_close), p5: fp(m.p5_close), p95: fp(m.p95_close) })}</p>
        <p className="num">{t('replay.avgR', { r: (m.avg_R >= 0 ? '+' : '') + m.avg_R.toFixed(3) })} · <Term k="R" /> · green {pctOf(m.p_green)}</p>
      </div>
      <p className="mt-3 text-xs text-muted num">{t('replay.meta', { n: count(m.replays), seed: m.seed, pool: m.pool_sessions, from: m.pool_from, to: m.pool_to, start: r.plan.entry_time, until: m.until, bars: m.bars_left })}</p>
      {mode === 'pro' ? <p className="mt-2 text-xs text-muted">{t('replay.how', { w: m.window })} Bands use a second run of {count(m.band_paths)} paths, same seed.</p> : null}
      {mode === 'beginner' && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer font-medium text-primary">Assumptions</summary><p className="mt-1">{t('replay.how', { w: m.window })}</p></details>}
    </Card>
  );
}

function Historical({ r, mode }: { r: ReplayResult; mode: 'beginner' | 'pro' }) {
  const t = useT();
  const h = r.history;
  const first = h.trades[0]?.date;
  const last = h.trades[h.trades.length - 1]?.date;
  return (
    <Card title={<span className="flex items-center gap-2"><History aria-hidden className="h-4 w-4" />{t('replay.hist')}</span>} actions={<Pill tone="muted">history</Pill>}>
      <p className="text-sm">{t('replay.histLine', { sessions: h.sessions, n: h.triggered, t: h.target, s: h.stop, c: h.close, r: (h.avg_R >= 0 ? '+' : '') + h.avg_R.toFixed(3) })}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-pos-soft p-2"><dt className="text-xs text-pos">{t('replay.targetFirst')}</dt><dd className="text-lg font-semibold num">{h.target}</dd></div>
        <div className="rounded-lg bg-neg-soft p-2"><dt className="text-xs text-neg">{t('replay.stopFirst')}</dt><dd className="text-lg font-semibold num">{h.stop}</dd></div>
        <div className="rounded-lg bg-sunken p-2"><dt className="text-xs text-muted">{t('replay.neither', { until: r.mc.until })}</dt><dd className="text-lg font-semibold num">{h.close}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted">Sample: {h.triggered} trades from {h.sessions} sessions, {first} to {last}. Small samples swing a lot.</p>
      {mode === 'pro' && (
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="table-pro w-full">
            <caption className="sr-only">{t('replay.trades')}</caption>
            <thead className="sticky top-0 bg-surface"><tr><th>Date</th><th>Time</th><th className="text-right">Entry</th><th className="text-right">Stop</th><th className="text-right">Target</th><th>Outcome</th><th className="text-right">R</th></tr></thead>
            <tbody>
              {h.trades.map((x) => (
                <tr key={x.date} className="border-t border-line">
                  <td>{x.date}</td><td>{x.time}</td><td className="text-right">{fp(x.entry)}</td><td className="text-right">{fp(x.stop)}</td><td className="text-right">{fp(x.target)}</td>
                  <td>{x.outcome === 'target' ? 'target' : x.outcome === 'stop' ? 'stop' : 'neither'}</td>
                  <td className={`text-right ${x.R > 0 ? 'text-pos' : x.R < 0 ? 'text-neg' : ''}`}>{x.R > 0 ? '+' : ''}{x.R.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
