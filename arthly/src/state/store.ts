/**
 * App state. Preferences and demo state persist in this browser
 * (localStorage, key "arthly"). Nothing here is shared, and nothing here is
 * sent to a broker: in demo mode orders go to a simulated paper ledger.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AlertFire, AlertRule, Config, DataSource, OpeningRange, OrderRecord, Position, ProposedOrder, SimState, StopRule, TargetRule } from '../domain/types';
import type { ExitPlanCalc } from '../domain/exitPlan';
import type { Lang } from '../i18n/dict';
import { AT_BROKER, TERMINAL, cancel as cancelOrder, fill as fillOrder, propose, reject as rejectOrder, revise } from '../domain/orderState';
import configExample from '../fixtures/config.example.json';

export type Theme = 'system' | 'light' | 'dark';
export type Mode = 'beginner' | 'pro';

export interface PlanInputs {
  symbol: string;
  date: string;
  setup: 'orb' | 'level';
  entry: number;
  entryTime: string;          // "10:15"
  entryBar?: number;
  stopRule: StopRule;
  stopValue?: number;
  targetRule: TargetRule;
  targetValue: number;
  flatBy: string;
  openingRange?: OpeningRange;
}

export interface SavedPlan { version: number; savedAt: string; inputs: PlanInputs; calc: ExitPlanCalc }

const DEFAULT_CONFIG = { ...(configExample as unknown as Config), blocked: [] as string[] };

interface State {
  prefs: { mode: Mode; lang: Lang; theme: Theme; dataSource: DataSource; serverUrl: string; sim: SimState };
  config: Config;
  watchlist: string[];
  symbol: string | null;
  scanMode: 'orb' | 'daily';
  plan: SavedPlan | null;
  demoClock: string;
  cash: number;
  realized: number;
  orders: OrderRecord[];
  activeOrderId: string | null;
  positions: Position[];
  alerts: AlertRule[];
  alertFired: Record<string, AlertFire>;
  alertLog: AlertFire[];

  setPref: <K extends keyof State['prefs']>(k: K, v: State['prefs'][K]) => void;
  setConfig: (patch: Partial<Config>) => void;
  setCash: (cash: number) => void;
  toggleWatch: (s: string) => void;
  selectSymbol: (s: string | null) => void;
  setScanMode: (m: 'orb' | 'daily') => void;
  savePlan: (inputs: PlanInputs, calc: ExitPlanCalc) => void;
  setDemoClock: (t: string) => void;
  /** keep the active draft in step with the current order: a change supersedes it */
  syncDraft: (order: ProposedOrder | null, planVersion: number) => void;
  ensureDraft: (order: ProposedOrder, planVersion: number) => OrderRecord;
  putOrder: (r: OrderRecord) => void;
  demoFill: (id: string, qty: number, price: number) => void;
  demoReject: (id: string, reason: string) => void;
  demoCancel: (id: string) => void;
  clearActive: () => void;
  addAlerts: (rules: AlertRule[]) => void;
  updateAlert: (id: string, rule: AlertRule) => void;
  removeAlert: (id: string) => void;
  recordFires: (fires: AlertFire[]) => void;
  resetAlert: (id: string) => void;
  resetDemo: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const initialDemo = {
  watchlist: ['TSLA'] as string[],
  symbol: 'TSLA' as string | null,
  scanMode: 'orb' as const,
  plan: null as SavedPlan | null,
  demoClock: '10:15',
  cash: 5000,
  realized: 0,
  orders: [] as OrderRecord[],
  activeOrderId: null as string | null,
  positions: [] as Position[],
  alerts: [{ id: 'opening-bell', type: 'opening_bell' }] as AlertRule[],
  alertFired: {} as Record<string, AlertFire>,
  alertLog: [] as AlertFire[],
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      prefs: { mode: 'beginner', lang: 'en', theme: 'system', dataSource: 'demo', serverUrl: 'http://127.0.0.1:8765', sim: 'normal' },
      config: DEFAULT_CONFIG,
      ...initialDemo,

      setPref: (k, v) => set((s) => ({ prefs: { ...s.prefs, [k]: v } })),
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch, paper: true, allow_margin: false, allow_options: false, allow_short: false } })),
      setCash: (cash) => set({ cash: Math.max(0, Math.round(cash * 100) / 100) }),
      toggleWatch: (sym) => set((s) => ({ watchlist: s.watchlist.includes(sym) ? s.watchlist.filter((x) => x !== sym) : [...s.watchlist, sym] })),
      selectSymbol: (sym) => set({ symbol: sym }),
      setScanMode: (m) => set({ scanMode: m }),
      savePlan: (inputs, calc) => set((s) => ({ plan: { version: (s.plan?.version ?? 0) + 1, savedAt: new Date().toISOString(), inputs, calc } })),
      setDemoClock: (t) => set({ demoClock: t }),

      syncDraft: (order, planVersion) => {
        const { activeOrderId, orders } = get();
        const active = orders.find((o) => o.id === activeOrderId);
        if (!active || AT_BROKER.includes(active.state) || TERMINAL.includes(active.state)) return;
        if (!order) {
          // the plan no longer sizes to an order: the draft cannot stand
          const [old] = revise(active, { ...active.order, qty: '0' }, planVersion, uid());
          set({ orders: orders.map((o) => (o.id === old.id ? old : o)), activeOrderId: null });
          return;
        }
        const [old, next] = revise(active, order, planVersion, uid());
        if (!next) return;
        set({ orders: [...orders.map((o) => (o.id === old.id ? old : o)), next], activeOrderId: next.id });
      },

      ensureDraft: (order, planVersion) => {
        const { activeOrderId, orders } = get();
        const active = orders.find((o) => o.id === activeOrderId);
        if (active && !AT_BROKER.includes(active.state) && !TERMINAL.includes(active.state)) {
          const [old, next] = revise(active, order, planVersion, uid());
          if (!next) return active;
          set({ orders: [...orders.map((o) => (o.id === old.id ? old : o)), next], activeOrderId: next.id });
          return next;
        }
        const r = propose(uid(), order, planVersion);
        set({ orders: [...orders, r], activeOrderId: r.id });
        return r;
      },

      putOrder: (r) => set((s) => ({ orders: s.orders.some((o) => o.id === r.id) ? s.orders.map((o) => (o.id === r.id ? r : o)) : [...s.orders, r] })),

      demoFill: (id, qty, price) => {
        const s = get();
        const r = s.orders.find((o) => o.id === id);
        if (!r) return;
        const before = r.filledQty;
        const next = fillOrder(r, qty, price);
        const added = next.filledQty - before;
        if (added <= 0) return;
        const sym = r.order.symbol;
        let positions = s.positions;
        let cash = s.cash;
        let realized = s.realized;
        const pos = positions.find((p) => p.symbol === sym && p.account === r.account);
        if (r.order.side === 'buy') {
          cash -= added * price;
          if (pos) {
            const q = pos.qty + added;
            positions = positions.map((p) => (p === pos ? { ...p, qty: q, avgPrice: (p.avgPrice * p.qty + price * added) / q } : p));
          } else {
            positions = [...positions, { symbol: sym, qty: added, avgPrice: price, account: r.account, openedAt: new Date().toISOString() }];
          }
        } else if (pos) {
          cash += added * price;
          realized += (price - pos.avgPrice) * added;
          const q = pos.qty - added;
          positions = q > 0 ? positions.map((p) => (p === pos ? { ...p, qty: q } : p)) : positions.filter((p) => p !== pos);
        }
        set({ orders: s.orders.map((o) => (o.id === id ? next : o)), positions, cash: Math.round(cash * 100) / 100, realized: Math.round(realized * 100) / 100 });
      },
      demoReject: (id, reason) => set((s) => ({ orders: s.orders.map((o) => (o.id === id ? rejectOrder(o, reason) : o)) })),
      demoCancel: (id) => set((s) => ({ orders: s.orders.map((o) => (o.id === id ? cancelOrder(o, 'you cancelled it') : o)), activeOrderId: s.activeOrderId === id ? null : s.activeOrderId })),
      clearActive: () => set({ activeOrderId: null }),

      addAlerts: (rules) => set((s) => ({ alerts: [...s.alerts.filter((a) => !rules.some((r) => r.id === a.id)), ...rules] })),
      updateAlert: (id, rule) => set((s) => {
        const { [id]: _drop, ...fired } = s.alertFired;
        return { alerts: s.alerts.map((a) => (a.id === id ? rule : a)), alertFired: fired };
      }),
      removeAlert: (id) => set((s) => {
        const { [id]: _drop, ...fired } = s.alertFired;
        return { alerts: s.alerts.filter((a) => a.id !== id), alertFired: fired };
      }),
      recordFires: (fires) => set((s) => ({
        alertFired: { ...s.alertFired, ...Object.fromEntries(fires.map((f) => [f.id, f])) },
        alertLog: [...fires, ...s.alertLog].slice(0, 50),
      })),
      resetAlert: (id) => set((s) => {
        const { [id]: _drop, ...fired } = s.alertFired;
        return { alertFired: fired };
      }),
      resetDemo: () => set({ ...structuredClone(initialDemo), config: DEFAULT_CONFIG }),
    }),
    {
      name: 'arthly',
      version: 1,
      storage: createJSONStorage(() => {
        try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
        catch { const mem = new Map<string, string>(); return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }; }
      }),
      partialize: (s) => ({
        prefs: { ...s.prefs, sim: 'normal' as SimState }, config: s.config, watchlist: s.watchlist, symbol: s.symbol, scanMode: s.scanMode,
        plan: s.plan, demoClock: s.demoClock, cash: s.cash, realized: s.realized, orders: s.orders, activeOrderId: s.activeOrderId,
        positions: s.positions, alerts: s.alerts, alertFired: s.alertFired, alertLog: s.alertLog,
      }),
    },
  ),
);
