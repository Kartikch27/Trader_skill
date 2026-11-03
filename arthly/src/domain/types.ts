/**
 * Domain types. Field names follow the JSON the day-trader-skill tools write
 * (trader/*.json), so a backend can pass those files through unchanged.
 */

export type SetupId = 'orb' | 'breakout_20d' | 'bull_flag' | 'reclaim_ma20' | 'oversold' | 'oversold_bounce';

/** trader/watchlist.json hit, plus fields Arthly's fixture builder derives from the raw charts. */
export interface ScanHit {
  symbol: string;
  setups: SetupId[];
  price: number;
  name?: string | null;
  change_pct?: number | null;
  price_time?: string;
  // orb
  at?: string;
  bar_start?: string;
  bar_index?: number;
  or_high?: number;
  or_low?: number;
  pct_over?: number;
  volume_so_far?: number | null;
  prev_close?: number | null;
  // daily
  close_date?: string;
  rsi?: number;
  volume?: number;
}

export interface ScanResult {
  mode: 'orb' | 'daily';
  as_of: string;
  universe: number;
  scanned: number;
  failed: number;
  unconfirmed?: number;
  source: string;
  or_minutes?: number;
  filters: { min_price: number; min_volume: number };
  note: string;
  data_note?: string;
  counts?: Record<string, number>;
  hits: ScanHit[];
}

export interface Bar { t: number; ny: string; o: number; h: number; l: number; c: number; v: number }

export interface OpeningRange { high: number; low: number; minutes: number }

/** trader/entry.json */
export interface EntrySignal {
  symbol: string;
  setup: 'orb' | 'level';
  side: 'buy';
  date: string;
  status: 'triggered' | 'waiting' | 'expired' | 'not_open' | 'forming' | 'no_data';
  time?: string;
  bar_start?: string;
  bar_index?: number;
  price?: number;
  level: number;
  interval: '5m' | '1m';
  opening_range: OpeningRange;
  reason?: string;
}

export type StopRule = 'or_mid' | 'or_low' | 'price' | 'pct' | 'atr';
export type TargetRule = 'r' | 'price';

/** trader/plan.json */
export interface Plan {
  symbol: string;
  side: 'buy';
  date: string;
  setup: 'orb' | 'level';
  entry: number;
  entry_time: string;
  entry_bar?: number;
  interval: '5m';
  opening_range?: OpeningRange;
  stop: number;
  stop_rule: StopRule;
  stop_label: string;
  stop_detail?: string;
  target: number;
  target_r: number;
  target_label: string;
  risk_per_share: number;
  reward_risk: number;
  flat_by: string;
}

/** trader/timemachine.json */
export interface ReplayResult {
  created_at: string;
  source: string;
  plan: Pick<Plan, 'symbol' | 'date' | 'entry' | 'entry_time' | 'stop' | 'target' | 'risk_per_share' | 'target_r' | 'stop_rule'> & { flat_by?: string };
  mc: {
    replays: number; seed: number; window: number; bars_left: number;
    p_target: number; p_stop: number; p_neither: number; p_green: number;
    median_close: number; p5_close: number; p95_close: number; avg_R: number;
    bands: number[][]; band_times: string[]; band_paths: number;
    sample_paths: number[][];
    hist: { lo: number; hi: number; bins: number[] };
    until: string; pool_sessions: number; pool_from: string; pool_to: string;
  };
  history: {
    sessions: number; triggered: number; target: number; stop: number; close: number; green: number; avg_R: number;
    trades: { date: string; time: string; entry: number; stop: number; target: number; outcome: 'target' | 'stop' | 'close'; R: number }[];
  };
  verdict: string;
  verdict_notes: string[];
  warnings: string[];
  note: string;
}

/** trader/config.json */
export interface Config {
  budget: number;
  cash_buffer_pct: number;
  max_position_pct: number;
  max_order_usd: number;
  min_order_usd: number;
  max_loss_per_trade_usd: number;
  max_daily_loss_usd: number;
  max_trades_per_day: number;
  max_orders_per_day: number;
  min_reward_risk: number;
  require_stop: boolean;
  no_entries_before: string | null;
  no_entries_after: string | null;
  flat_by: string;
  fractional: boolean;
  broker: 'alpaca' | 'ibkr';
  paper: boolean;
  blocked: string[];
  allow_options: boolean;
  allow_margin: boolean;
  allow_short: boolean;
  pdt_guard: boolean;
}

export interface SizeLimit { name: 'max loss' | 'position cap' | 'max order' | 'cash'; usd: number; per: number; shares: number; how: string; binds: boolean }

export interface Sizing {
  symbol: string; entry: number; entry_from: 'plan' | 'price' | 'limit'; stop: number; target: number;
  risk_per_share: number; reward_risk: number; budget: number; cash_buffer: number; cash_available: number;
  limits: SizeLimit[]; qty: number; bound_by: SizeLimit['name']; cost: number; max_loss: number;
  potential_gain: number; refusal: string | null; refusal_code: string | null; order_type: 'market' | 'limit';
}

/** The fields sent to Alpaca's place_stock_order (strings, as trader-budget writes them). */
export interface AlpacaOrder {
  symbol: string;
  side: 'buy' | 'sell';
  qty: string;
  type: 'market' | 'limit';
  time_in_force: 'day' | 'gtc';
  limit_price?: string;
  order_class?: 'bracket';
  take_profit_limit_price?: string;
  stop_loss_stop_price?: string;
}

/** trader/orders.json entry: the Alpaca fields plus notes that are never sent. */
export interface ProposedOrder extends AlpacaOrder {
  why?: string;
  plan?: { entry: number; stop: number; target: number; risk_per_share: number; max_loss: number; setup: string; entry_time: string; flat_by: string };
}

export type CheckStatus = 'ok' | 'block' | 'warn' | 'needs_info';

export interface RuleCheck { id: string; status: CheckStatus; detail: string }

export interface RiskReport {
  fingerprint: string;
  verdict: 'PASS' | 'BLOCK';
  kind: 'entry' | 'exit';
  checks: RuleCheck[];
  max_loss: number | null;
  reward_risk: number | null;
  value_usd: number;
  checked_at: string;   // ISO
  date: string;         // New York date the check applies to
  source: 'browser-preview' | 'check.py';
}

export type OrderState =
  | 'proposed' | 'checked' | 'blocked' | 'approved' | 'submitted'
  | 'partially_filled' | 'filled' | 'rejected' | 'cancelled' | 'superseded';

export interface OrderEvent { at: string; state: OrderState; note: string }

export interface OrderRecord {
  id: string;
  version: number;
  planVersion: number;
  account: 'paper' | 'live';
  broker: 'demo' | 'alpaca';
  order: ProposedOrder;
  fingerprint: string;
  state: OrderState;
  check?: RiskReport;
  approval?: { at: string; fingerprint: string; method: 'button' };
  filledQty: number;
  avgFillPrice?: number;
  brokerOrderId?: string;
  history: OrderEvent[];
}

export interface Position { symbol: string; qty: number; avgPrice: number; account: 'paper' | 'live'; openedAt: string }

export type AlertType = 'above' | 'below' | 'stop' | 'target' | 'pct_move' | 'time' | 'opening_bell';

/** trader/alerts.json rule */
export interface AlertRule {
  id: string;
  type: AlertType;
  symbol?: string;
  price?: number;
  pct?: number;
  direction?: 'up' | 'down';
  at?: string;
  label?: string;
  note?: string;
  date?: string;
  before_close?: boolean;
  rearm?: boolean;
}

export interface AlertFire { id: string; at: string; message: string; price?: number }

export interface NewsItem {
  id: string; source: string; kind: 'headline' | 'filing'; ticker: string; title: string; summary?: string;
  link: string; time: string; touches: string[]; tags: string[]; important?: boolean;
}

export interface NewsResult { checked: string; moves: { ticker: string; price: number; prev_close: number; pct: number; time: string; moving: boolean }[]; items: NewsItem[]; notes: string[] }

export interface Quote { price: number; prev_close?: number; time: string; name?: string | null }

export interface AnalystRow {
  end: string; start: string; fiscal: string; derived: boolean;
  revenue?: number | null; gross_profit?: number | null; operating_income?: number | null; net_income?: number | null;
  eps_diluted?: number | null; gross_margin?: number | null; operating_margin?: number | null; net_margin?: number | null;
  revenue_yoy?: number | null; net_income_yoy?: number | null; eps_yoy?: number | null; filed?: string; form?: string;
}
export interface AnalystResult { ticker: string; result: { entity: string; cik: string; rows: AnalystRow[]; ttm: { revenue: number; net_income: number; eps_diluted: number }; [k: string]: unknown } }

export interface PtrRow {
  owner: string; owner_name: string; type: string; type_name: string; date: string; notified?: string;
  amount: string; description?: string | null; ticker?: string | null; asset: string; asset_type?: string;
  amount_low?: number; amount_high?: number; shares?: number;
  option?: { contracts?: number; kind?: string; strike?: number; expires?: string; exercised?: boolean };
  days_to_disclose?: number | null; late?: boolean;
}
export interface PtrReport { name: string; district: string; doc_id: string; filed?: string; rows: PtrRow[]; excerpt: boolean; url: string }
export interface PtrIndexRow { doc_id: string; name: string; district: string; filed: string; url: string; type_name: string }

export interface Account {
  mode: 'paper' | 'live';
  provider: 'demo' | 'alpaca';
  cash: number;
  equity: number;
  buying_power?: number;
  status: string;
  as_of: string;
}

export type DataSource = 'demo' | 'connected';
export type SimState = 'normal' | 'loading' | 'empty' | 'partial' | 'stale' | 'disconnected' | 'error';
