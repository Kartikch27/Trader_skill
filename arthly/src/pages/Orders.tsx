import { useMemo, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { useStore } from '../state/store';
import { useMode, useService, useT } from '../state/hooks';
import { useJourney } from '../state/journey';
import { Banner, Card, Empty, PageHeader, Pill, Segmented, type Tone } from '../components/ui';
import { approve, approvalBlocker, propose, recordCheck, submit, TERMINAL } from '../domain/orderState';
import { checkOrder } from '../domain/risk';
import { money, nyDateTime, price as fp, signedMoney } from '../domain/format';
import quotes from '../fixtures/quotes.json';
import type { OrderRecord, OrderState, ProposedOrder, Quote } from '../domain/types';
import type { Key } from '../i18n/dict';

const Q = quotes.quotes as Record<string, Quote>;
const TONE: Record<OrderState, Tone> = { proposed: 'muted', checked: 'info', blocked: 'neg', approved: 'info', submitted: 'info', partially_filled: 'warn', filled: 'pos', rejected: 'neg', cancelled: 'muted', superseded: 'muted' };
type Filter = 'all' | 'open' | 'filled' | 'closed';

export function Orders() {
  const t = useT();
  const mode = useMode();
  const svc = useService();
  const orders = useStore((s) => s.orders);
  const positions = useStore((s) => s.positions);
  const realized = useStore((s) => s.realized);
  const putOrder = useStore((s) => s.putOrder);
  const demoFill = useStore((s) => s.demoFill);
  const demoReject = useStore((s) => s.demoReject);
  const demoCancel = useStore((s) => s.demoCancel);
  const source = useStore((s) => s.prefs.dataSource);
  const j = useJourney();
  const [acct, setAcct] = useState<'paper' | 'live'>('paper');
  const [filter, setFilter] = useState<Filter>('all');
  const [showSuperseded, setShowSuperseded] = useState(false);

  const list = useMemo(() => orders
    .filter((o) => o.account === acct)
    .filter((o) => showSuperseded || o.state !== 'superseded')
    .filter((o) => filter === 'all' || (filter === 'open' ? !TERMINAL.includes(o.state) : filter === 'filled' ? o.state === 'filled' || o.state === 'partially_filled' : ['rejected', 'cancelled', 'superseded'].includes(o.state)))
    .slice().reverse(), [orders, acct, filter, showSuperseded]);

  const prepareFlatten = (sym: string, qty: number) => {
    const o: ProposedOrder = { symbol: sym, side: 'sell', qty: String(qty), type: 'market', time_in_force: 'day', why: `close ${qty} ${sym} (flat by the close)` };
    putOrder(propose(Math.random().toString(36).slice(2, 10), o, 0));
  };
  const runCheck = (r: OrderRecord) => putOrder(recordCheck(r, checkOrder(r.order, j.riskCtx)));
  const confirmSell = async (r: OrderRecord) => {
    const a = approve(r, j.today);
    putOrder(a);
    const { brokerOrderId } = await svc.submitPaperOrder(a);
    putOrder(submit(a, brokerOrderId));
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('ord.title')} subtitle={t('ord.triggerNotOrder')} actions={<Segmented label="Account" value={acct} onChange={setAcct} options={[{ value: 'paper', label: t('ord.paper') }, { value: 'live', label: t('ord.live') }]} />} />
      {acct === 'live' ? <Card><Empty title={t('ord.liveNone')} hint={t('set.liveDisabled')} /></Card> : (
        <>
          <Card title={t('ord.positions')} actions={<span className="text-sm text-muted">{t('term.realized')}: <span className={`num font-medium ${realized >= 0 ? 'text-pos' : 'text-neg'}`}>{signedMoney(realized)}</span></span>}>
            {positions.length === 0 ? <p className="text-sm text-muted">{t('ord.noPositions')}</p> : (
              <div className="overflow-x-auto">
                <table className="table-pro w-full min-w-[560px]">
                  <thead className="border-b border-line"><tr><th>Symbol</th><th className="text-right">Shares</th><th className="text-right">{t('ord.avg')}</th><th className="text-right">{t('ord.last')}</th><th className="text-right">{t('term.unrealized')}</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {positions.map((p) => {
                      const last = Q[p.symbol]?.price ?? p.avgPrice;
                      const u = (last - p.avgPrice) * p.qty;
                      const pending = orders.some((o) => o.order.symbol === p.symbol && o.order.side === 'sell' && !TERMINAL.includes(o.state));
                      return (
                        <tr key={p.symbol} className="border-b border-line last:border-0">
                          <td className="font-semibold">{p.symbol} <Pill tone="info">{t('ord.paper')}</Pill></td>
                          <td className="text-right">{p.qty}</td>
                          <td className="text-right">{fp(p.avgPrice)}</td>
                          <td className="text-right">{fp(last)}<div className="text-[11px] text-muted">{Q[p.symbol] ? nyDateTime(Q[p.symbol].time) : ''}</div></td>
                          <td className={`text-right ${u >= 0 ? 'text-pos' : 'text-neg'}`}>{signedMoney(u)}</td>
                          <td className="text-right"><button className="btn-secondary min-h-[36px] px-3 text-xs" disabled={pending} onClick={() => prepareFlatten(p.symbol, p.qty)}><LogOut aria-hidden className="h-3.5 w-3.5" />{t('ord.flatten')}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted">{t('ord.flattenNote')}</p>
              </div>
            )}
          </Card>

          <Card title={t('ord.orders')} actions={
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" label="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: t('common.all') }, { value: 'open', label: 'Open' }, { value: 'filled', label: t('ord.state.filled') }, { value: 'closed', label: 'Closed' }]} />
              <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} className="accent-[rgb(var(--primary))]" />Show replaced versions</label>
            </div>}>
            {list.length === 0 ? <p className="text-sm text-muted">{t('ord.noOrders')}</p> : (
              <ul className="space-y-3">
                {list.map((o) => (
                  <OrderRow key={o.id} o={o} mode={mode} today={j.today} demo={source === 'demo'}
                    onCheck={() => runCheck(o)} onConfirm={() => confirmSell(o)}
                    onFill={() => demoFill(o.id, Number(o.order.qty) - o.filledQty, o.order.side === 'sell' ? Q[o.order.symbol]?.price ?? 0 : o.order.plan?.entry ?? Q[o.order.symbol]?.price ?? 0)}
                    onPartial={() => demoFill(o.id, Math.max(1, Math.floor((Number(o.order.qty) - o.filledQty) / 2)), o.order.side === 'sell' ? Q[o.order.symbol]?.price ?? 0 : o.order.plan?.entry ?? 0)}
                    onReject={() => demoReject(o.id, 'demo broker rejected it (simulated)')} onCancel={() => demoCancel(o.id)} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function OrderRow({ o, mode, today, demo, onCheck, onConfirm, onFill, onPartial, onReject, onCancel }: {
  o: OrderRecord; mode: 'beginner' | 'pro'; today: string; demo: boolean; onCheck: () => void; onConfirm: () => void; onFill: () => void; onPartial: () => void; onReject: () => void; onCancel: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(mode === 'pro');
  const isSellFlatten = o.order.side === 'sell' && o.planVersion === 0;
  const canConfirm = isSellFlatten && approvalBlocker(o, today) === null;
  return (
    <li className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="font-medium">{o.order.side.toUpperCase()} {o.order.qty} {o.order.symbol} <span className="text-xs font-normal text-muted">· v{o.version}{o.planVersion ? ` · plan v${o.planVersion}` : ''} · {o.broker === 'demo' ? 'demo ledger' : o.broker}</span></p>
          <p className="text-xs text-muted num">
            {o.order.type}{o.order.stop_loss_stop_price ? ` · stop ${o.order.stop_loss_stop_price} · take-profit ${o.order.take_profit_limit_price}` : ''}
            {o.filledQty ? ` · filled ${o.filledQty} @ ${fp(o.avgFillPrice)}` : ''}
            {o.check?.max_loss != null ? ` · max loss ${money(o.check.max_loss)}` : ''}
          </p>
        </div>
        <Pill tone={TONE[o.state]}>{t(`ord.state.${o.state}` as Key)}</Pill>
      </div>
      {(isSellFlatten && (o.state === 'proposed' || o.state === 'checked' || o.state === 'blocked')) && (
        <div className="flex flex-wrap gap-2 border-t border-line px-3 py-2">
          <button className="btn-secondary min-h-[36px] text-xs" onClick={onCheck}>{o.check ? 'Run the check again' : 'Run the rules check'}</button>
          <button className="btn-primary min-h-[36px] text-xs" disabled={!canConfirm} onClick={onConfirm}>{t('review.confirm')}</button>
          {!canConfirm && <span className="self-center text-xs text-muted">{t(`review.why.${approvalBlocker(o, today) ?? 'not_checked'}` as Key)}</span>}
        </div>
      )}
      {demo && (o.state === 'submitted' || o.state === 'partially_filled') && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <span className="text-xs font-medium text-muted">{t('ord.demoControls')}:</span>
          <button className="btn-secondary min-h-[32px] px-2.5 text-xs" onClick={onFill}>{t('ord.simFill')}</button>
          {Number(o.order.qty) - o.filledQty > 1 && <button className="btn-secondary min-h-[32px] px-2.5 text-xs" onClick={onPartial}>{t('ord.simPartial')}</button>}
          {o.state === 'submitted' && <button className="btn-secondary min-h-[32px] px-2.5 text-xs" onClick={onReject}>{t('ord.simReject')}</button>}
          <button className="btn-danger min-h-[32px] px-2.5 text-xs" onClick={onCancel}>{t('ord.cancel')}</button>
        </div>
      )}
      <div className="border-t border-line">
        <button className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted hover:text-ink" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
          {t('ord.history')} ({o.history.length})<ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <ol className="space-y-1 px-3 pb-3">
            {o.history.map((h, i) => (
              <li key={i} className="flex gap-3 text-xs"><span className="w-28 shrink-0 num text-muted">{nyDateTime(h.at)}</span><span className="font-medium">{t(`ord.state.${h.state}` as Key)}</span><span className="text-muted">{h.note}</span></li>
            ))}
            {o.check && <li className="pt-1 text-xs text-muted">Check {o.check.verdict} ({o.check.source}) for fingerprint <span className="font-mono">{o.check.fingerprint}</span>{o.approval ? ` · confirmed for ${o.approval.fingerprint}` : ''}</li>}
            {o.state === 'superseded' && <li className="pt-1"><Banner tone="muted">This version's check and confirmation no longer count.</Banner></li>}
          </ol>
        )}
      </div>
    </li>
  );
}
