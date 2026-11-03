/**
 * The trade journey, derived from the saved plan: sizing, the bracket order,
 * its fingerprint, the active order record and the context for the rules
 * check. Every screen reads the same derivation, so the symbol, plan version
 * and order stay in step across steps and modes.
 */
import { useMemo } from 'react';
import { useStore } from './store';
import { useNow } from './hooks';
import { bracketOrder, sizeTrade } from '../domain/sizing';
import { fingerprint } from '../domain/fingerprint';
import { AT_BROKER } from '../domain/orderState';
import type { RiskContext } from '../domain/risk';
import { toNy } from '../domain/market';
import quotes from '../fixtures/quotes.json';

export const DEMO_DATE = '2026-10-19';

export function useJourney() {
  const plan = useStore((s) => s.plan);
  const config = useStore((s) => s.config);
  const cash = useStore((s) => s.cash);
  const orders = useStore((s) => s.orders);
  const positions = useStore((s) => s.positions);
  const activeOrderId = useStore((s) => s.activeOrderId);
  const now = useNow();

  return useMemo(() => {
    const sizing = plan
      ? sizeTrade({ symbol: plan.inputs.symbol, entry: plan.calc.entry, stop: plan.calc.stop, target: plan.calc.target, config, cash })
      : null;
    const order = sizing && plan
      ? bracketOrder(sizing, { setup: plan.inputs.setup, entry_time: plan.inputs.entryTime ? toAmPm(plan.inputs.entryTime) : '', flat_by: plan.inputs.flatBy, max_loss_per_trade_usd: config.max_loss_per_trade_usd })
      : null;
    const fp = order ? fingerprint(order as unknown as Record<string, unknown>) : null;
    const active = orders.find((o) => o.id === activeOrderId) ?? null;
    const today = now.date;
    const placedToday = orders.filter((o) => AT_BROKER.includes(o.state) && o.history.some((h) => h.state === 'submitted' && dateOf(h.at, now.demo) === today));
    const entriesToday = placedToday.filter((o) => o.order.side === 'buy').map((o) => ({ symbol: o.order.symbol, side: o.order.side, maxLoss: o.check?.max_loss ?? 0 }));
    const lastPrice = (sym: string) => (quotes.quotes as Record<string, { price: number }>)[sym]?.price;
    const holdings = Object.fromEntries(positions.map((p) => [p.symbol, { qty: p.qty, value: Math.round(p.qty * (lastPrice(p.symbol) ?? p.avgPrice) * 100) / 100 }]));
    const riskCtx: RiskContext = { config, now, cash, holdings, entriesToday, ordersToday: placedToday.length };
    const lossUsed = entriesToday.reduce((a, e) => a + e.maxLoss, 0);
    return { plan, sizing, order, fp, active, riskCtx, today, lossUsed, entriesToday };
  }, [plan, config, cash, orders, positions, activeOrderId, now]);
}

/** The demo journey runs on the reel's date; an event's date is that date in demo mode. */
function dateOf(iso: string, demo: boolean) {
  return demo ? DEMO_DATE : toNy(new Date(iso)).date;
}

export function toAmPm(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
