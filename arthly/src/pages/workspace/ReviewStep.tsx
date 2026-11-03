import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Send } from 'lucide-react';
import { useStore } from '../../state/store';
import { useMode, useService, useT } from '../../state/hooks';
import { useJourney } from '../../state/journey';
import { Banner, Card, Empty, Pill, Spinner, Term, WhyDisabled } from '../../components/ui';
import { approvalBlocker, approve, submit } from '../../domain/orderState';
import { money, nyDateTime, price as fp } from '../../domain/format';
import type { Key } from '../../i18n/dict';

export function ReviewStep({ symbol }: { symbol: string }) {
  const t = useT();
  const mode = useMode();
  const svc = useService();
  const j = useJourney();
  const orders = useStore((s) => s.orders);
  const putOrder = useStore((s) => s.putOrder);
  const demoFill = useStore((s) => s.demoFill);
  const clearActive = useStore((s) => s.clearActive);
  const source = useStore((s) => s.prefs.dataSource);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setAck(false), [j.fp]);

  const done = doneId ? orders.find((o) => o.id === doneId) : null;
  if (done) {
    return (
      <Card>
        <div className="space-y-3 text-center">
          <CheckCircle2 aria-hidden className="mx-auto h-10 w-10 text-pos" />
          <p className="font-medium">{t('review.submitted')}</p>
          <p className="text-sm text-muted">{done.order.side.toUpperCase()} {done.order.qty} {done.order.symbol} · {t(`ord.state.${done.state}` as Key)}{done.avgFillPrice ? ` · ${fp(done.avgFillPrice)}` : ''}</p>
          {source === 'demo' && <p className="text-xs text-muted">Demo fill: simulated at the planned entry price. A real market order fills at whatever the market gives.</p>}
          <div className="flex justify-center gap-2"><Link className="btn-primary" to="/orders">{t('nav.orders')}</Link><Link className="btn-secondary" to="/alerts">{t('al.fromPlan')}</Link></div>
        </div>
      </Card>
    );
  }

  if (!j.plan || j.plan.inputs.symbol !== symbol || !j.order) {
    return <Card><Empty title={t('review.why.noOrder')} action={<Link className="btn-primary" to="/workspace/size">{t('ws.step.size')}</Link>} /></Card>;
  }
  const rec = j.active && j.active.fingerprint === j.fp ? j.active : null;
  const replaced = orders.filter((o) => o.state === 'superseded' && o.order.symbol === symbol).sort((a, b) => b.version - a.version)[0];
  const blocker = !rec ? 'not_checked' : approvalBlocker(rec, j.today);
  const reason = blocker ? t(`review.why.${blocker}` as Key) : !ack ? t('review.why.ack') : null;
  const o = j.order;

  const confirm = async () => {
    if (!rec || blocker || !ack) return;
    setBusy(true); setErr(null);
    try {
      let r = approve(rec, j.today);
      putOrder(r);
      const { brokerOrderId } = await svc.submitPaperOrder(r);
      r = submit(r, brokerOrderId);
      r = { ...r, broker: source === 'demo' ? 'demo' : 'alpaca' };
      putOrder(r);
      clearActive();
      setDoneId(r.id);
      if (source === 'demo') setTimeout(() => demoFill(r.id, Number(r.order.qty), j.plan!.calc.entry), 1200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card title={t('review.title')} className="lg:col-span-3">
        {replaced && rec && <Banner tone="info">{t('review.invalidated', { v: replaced.version })}</Banner>}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Item k={t('review.symbol')} v={<span className="text-lg font-semibold">{o.symbol}</span>} />
          <Item k={t('review.account')} v={<Pill tone="info">{t('badge.paper')}</Pill>} />
          <Item k={t('review.side')} v={t('review.buy')} />
          <Item k={t('review.qty')} v={t('common.shares', { n: o.qty })} />
          <Item k={t('review.type')} v={<>{t('review.market')} · <Term k="bracket" /></>} />
          <Item k={t('review.entryRef')} v={fp(o.plan?.entry)} />
          <Item k={<Term k="stop">Stop-loss</Term>} v={fp(Number(o.stop_loss_stop_price))} />
          <Item k={<Term k="target">Take-profit</Term>} v={fp(Number(o.take_profit_limit_price))} />
          <Item k={t('size.lossAtStop')} v={<span className="text-neg">{money(o.plan?.max_loss)}</span>} />
        </dl>
        <p className="mt-4 text-sm"><span className="font-medium">{t('review.exitInstr')}: </span>{t('review.exitText', { stop: o.stop_loss_stop_price ?? '', target: o.take_profit_limit_price ?? '', flat: o.plan?.flat_by ?? '' })}</p>
        <p className="mt-2 text-xs text-muted">{t('common.beforeFees')} {t('size.notMax')}</p>
        <p className="mt-2 text-xs text-muted">{t('review.version', { v: rec?.version ?? 1, p: j.plan.version })}{rec?.check ? ` · ${rec.check.verdict} ${nyDateTime(rec.check.checked_at)}` : ''}</p>

        <div className="mt-5 border-t border-line pt-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" checked={ack} disabled={!!blocker} onChange={(e) => setAck(e.target.checked)} />
            <span>{t('review.ack')}</span>
          </label>
          <button className="btn-primary mt-3 w-full sm:w-auto" disabled={!!reason || busy} onClick={confirm} aria-describedby="confirm-why">
            {busy ? <Spinner /> : <Send aria-hidden className="h-4 w-4" />}{t('review.confirm')}
          </button>
          <div id="confirm-why"><WhyDisabled reason={reason} /></div>
          {blocker && blocker !== 'wrong_state' && <Link to="/workspace/size" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">{t('ws.step.size')} →</Link>}
          {err && <Banner tone="neg" title={t('state.error')}>{err}</Banner>}
          <p className="mt-3 text-xs text-muted">{source === 'demo' ? t('review.demoBroker') : t('review.why.live')}</p>
        </div>
      </Card>
      <Card title={t('review.json')} className="lg:col-span-2">
        <pre className="overflow-x-auto rounded-lg bg-sunken p-3 font-mono text-xs leading-relaxed">{JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'why' && k !== 'plan')), null, 2)}</pre>
        <p className="mt-2 text-xs text-muted"><Term k="fingerprint" /> <span className="font-mono">{j.fp}</span></p>
        {mode === 'pro' && o.why && <p className="mt-2 text-xs text-muted">why (a note, never sent): {o.why}</p>}
      </Card>
    </div>
  );
}

function Item({ k, v }: { k: ReactNode; v: ReactNode }) {
  return <div><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 num font-medium">{v}</dd></div>;
}
