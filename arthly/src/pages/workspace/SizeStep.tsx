import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, ShieldCheck } from 'lucide-react';
import { useStore } from '../../state/store';
import { useMode, useService, useT } from '../../state/hooks';
import { useJourney } from '../../state/journey';
import { Advanced, Banner, Card, Empty, Field, NumberInput, Pill, Spinner, Stat, Term, WhyDisabled, type Tone } from '../../components/ui';
import { checkOrder } from '../../domain/risk';
import { recordCheck } from '../../domain/orderState';
import { sizeTrade } from '../../domain/sizing';
import { money, price as fp } from '../../domain/format';
import type { CheckStatus, Sizing } from '../../domain/types';
import type { Key } from '../../i18n/dict';

const STATUS_TONE: Record<CheckStatus, Tone> = { ok: 'pos', block: 'neg', warn: 'warn', needs_info: 'warn' };
const STATUS_KEY: Record<CheckStatus, Key> = { ok: 'rules.ok', block: 'rules.block', warn: 'rules.warn', needs_info: 'rules.needs_info' };

export function SizeStep({ symbol }: { symbol: string }) {
  const t = useT();
  const mode = useMode();
  const nav = useNavigate();
  const svc = useService();
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const cash = useStore((s) => s.cash);
  const setCash = useStore((s) => s.setCash);
  const ensureDraft = useStore((s) => s.ensureDraft);
  const putOrder = useStore((s) => s.putOrder);
  const source = useStore((s) => s.prefs.dataSource);
  const j = useJourney();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!j.plan || j.plan.inputs.symbol !== symbol) {
    return <Card><Empty title={t('ws.needPlan')} hint="Save an exit plan first: the size comes from the entry and the stop." action={<Link className="btn-primary" to="/workspace/exit">{t('ws.step.exit')}</Link>} /></Card>;
  }
  const s = j.sizing!;
  const check = j.active?.check && j.active.fingerprint === j.fp ? j.active.check : null;

  const run = async () => {
    if (!j.order || !j.plan) return;
    setBusy(true); setErr(null);
    try {
      const draft = ensureDraft(j.order, j.plan.version);
      const server = source === 'connected' ? await svc.riskCheck(j.order, config) : null;
      const report = server ?? checkOrder(j.order, j.riskCtx);
      putOrder(recordCheck(draft, report));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title={t('size.inputs')} className="lg:col-span-2">
          <div className="space-y-3">
            <Field htmlFor="sz-cap" label={t('size.capital')}>
              <NumberInput id="sz-cap" value={config.budget} onChange={(v) => setConfig({ budget: v ?? 0 })} prefix="$" step={100} />
            </Field>
            <Field htmlFor="sz-cash" label={t('size.cash')} hint={source === 'demo' ? 'Demo paper ledger cash. Fills change it.' : undefined}>
              <NumberInput id="sz-cash" value={cash} onChange={(v) => setCash(v ?? 0)} prefix="$" step={100} />
            </Field>
            <Field htmlFor="sz-risk" label={t('size.riskAllow')} hint={mode === 'beginner' ? 'The most this one trade should lose if the stop fills at its price.' : undefined}>
              <NumberInput id="sz-risk" value={config.max_loss_per_trade_usd} onChange={(v) => setConfig({ max_loss_per_trade_usd: v ?? 0 })} prefix="$" step={5} />
            </Field>
            <Advanced defaultOpen={mode === 'pro'}>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <Field htmlFor="sz-buf" label={t('size.buffer')}><NumberInput id="sz-buf" value={config.cash_buffer_pct} onChange={(v) => setConfig({ cash_buffer_pct: v ?? 0 })} suffix="%" step={1} /></Field>
                <Field htmlFor="sz-pos" label={t('size.posCap')}><NumberInput id="sz-pos" value={config.max_position_pct} onChange={(v) => setConfig({ max_position_pct: v ?? 0 })} suffix="%" step={5} /></Field>
                <Field htmlFor="sz-max" label={t('size.maxOrder')}><NumberInput id="sz-max" value={config.max_order_usd} onChange={(v) => setConfig({ max_order_usd: v ?? 0 })} prefix="$" step={100} /></Field>
              </div>
            </Advanced>
            <p className="text-xs text-muted">{t('set.rulesNote')}</p>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Calculator aria-hidden className="h-4 w-4" /><Term k="size">{t('size.title')}</Term></span>} className="lg:col-span-3">
          <SizingView s={s} t={t} mode={mode} allowance={config.max_loss_per_trade_usd} />
        </Card>
      </div>

      <ExampleCard />

      <Card title={<span className="flex items-center gap-2"><ShieldCheck aria-hidden className="h-4 w-4" />{t('rules.title')}</span>}
        actions={check ? <Pill tone={check.verdict === 'PASS' ? 'pos' : 'neg'}>{check.verdict === 'PASS' ? t('rules.summary.pass') : t('rules.summary.block', { n: check.checks.filter((c) => c.status === 'block' || c.status === 'needs_info').length })}</Pill> : undefined}>
        <p className="mb-3 text-xs text-muted">{t('rules.preview')}</p>
        {j.active?.check && j.active.check.fingerprint !== j.fp && <Banner tone="warn">{t('rules.outdated')}</Banner>}
        {check && (
          <ul className={`grid gap-2 ${mode === 'pro' ? 'md:grid-cols-2' : ''}`}>
            {check.checks.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 rounded-lg border border-line p-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`rule.${c.id}` as Key)}</p>
                  <p className="text-xs text-muted">{c.detail}</p>
                </div>
                <div className="shrink-0"><Pill tone={STATUS_TONE[c.status]}>{t(STATUS_KEY[c.status])}</Pill></div>
              </li>
            ))}
          </ul>
        )}
        {err && <Banner tone="neg" title={t('state.error')}>{err}</Banner>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={check ? 'btn-secondary' : 'btn-primary'} disabled={!j.order || busy} onClick={run}>{busy ? <Spinner /> : <ShieldCheck aria-hidden className="h-4 w-4" />}{check ? t('rules.rerun') : t('rules.run')}</button>
          {check?.verdict === 'PASS' && <button className="btn-primary" onClick={() => nav('/workspace/review')}>{t('ws.step.review')}</button>}
        </div>
        <WhyDisabled reason={!j.order ? t('review.why.noOrder') : null} />
        {check && <p className="mt-3 text-xs text-muted">{t('rules.notSafe')} <Term k="fingerprint" /> <span className="font-mono">{check.fingerprint}</span></p>}
      </Card>
    </div>
  );
}

function SizingView({ s, t, mode, allowance, example }: { s: Sizing; t: ReturnType<typeof useT>; mode: 'beginner' | 'pro'; allowance: number; example?: boolean }) {
  const riskBased = s.limits.find((l) => l.name === 'max loss');
  return (
    <div className="space-y-4">
      {s.entry_from === 'price' && <Banner tone="warn">{t('size.freshPrice', { p: fp(s.entry) })}</Banner>}
      {s.refusal && <Banner tone="neg" title={t('size.refused')}>{t(`size.refusal.${s.refusal_code}` as Key, { risk: money(s.risk_per_share), allow: money(allowance), rr: s.reward_risk.toFixed(2), min: useStore.getState().config.min_reward_risk, symbol: s.symbol, limit: s.bound_by })}</Banner>}
      {s.risk_per_share > 0 && (
        <div className="rounded-lg bg-sunken/70 p-3 text-sm">
          <p className="mb-1 font-medium">{t('size.how')}</p>
          <ol className="list-decimal space-y-0.5 pl-5 num">
            <li>{t('size.formula1', { e: fp(s.entry), s: fp(s.stop), r: fp(s.risk_per_share) })}</li>
            {riskBased && <li>{t('size.formula2', { a: money(allowance), r: fp(s.risk_per_share), n: riskBased.shares })}</li>}
            <li>{t('size.formula3')}</li>
          </ol>
        </div>
      )}
      {s.limits.length > 0 && (
        <table className="table-pro w-full">
          <caption className="sr-only">{t('size.how')}</caption>
          <thead className="border-b border-line"><tr><th>Limit</th>{mode === 'pro' && <th>Math</th>}<th className="text-right">Shares</th></tr></thead>
          <tbody>
            {s.limits.map((l) => (
              <tr key={l.name} className={`border-b border-line last:border-0 ${l.binds ? 'font-semibold' : ''}`}>
                <td>{t(`size.limit.${l.name}` as Key)} {l.binds && <Pill tone="info">{t('size.decides')}</Pill>}</td>
                {mode === 'pro' && <td className="text-xs text-muted">{l.how}</td>}
                <td className="text-right">{l.shares}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!s.refusal && (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t('size.qty')} value={t('common.shares', { n: s.qty })} />
            <Stat label={t('size.value')} value={money(s.cost)} />
            <Stat label={t('size.lossAtStop')} value={money(s.max_loss)} tone="neg" />
            <Stat label={t('size.gainAtTarget')} value={money(s.potential_gain)} tone="pos" />
          </dl>
          <p className="text-sm">{t('size.lossSentenceEn', { loss: money(s.max_loss) })} <Term k="rr">{t('exit.rr')}</Term> <span className="num font-medium">{s.reward_risk.toFixed(2)} : 1</span>.</p>
          <p className="text-xs text-muted">{t('common.beforeFees')} <Term k="slippage" /> · {t('size.notMax')}</p>
          {example && <p className="text-xs text-muted">{t('size.exampleNote')}</p>}
        </>
      )}
    </div>
  );
}

function ExampleCard() {
  const t = useT();
  const mode = useMode();
  const config = useStore((s) => s.config);
  const [open, setOpen] = useState(false);
  const ex = sizeTrade({ symbol: 'EXAMPLE', entry: 100, stop: 98, target: 104, config: { ...config, budget: 5000, max_loss_per_trade_usd: 50 }, cash: 5000 });
  return (
    <div className="card">
      <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium sm:px-5" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {t('size.example')}<span aria-hidden className="text-muted">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="border-t border-line card-pad"><SizingView s={ex} t={t} mode={mode} allowance={50} example /></div>}
    </div>
  );
}
