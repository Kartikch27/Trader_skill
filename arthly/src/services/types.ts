/**
 * The one interface the screens use. Two adapters implement it:
 *   - DemoAdapter: the repository's saved fixtures, replayed in the browser.
 *   - HttpAdapter: the PROPOSED backend contract in docs/BACKEND_CONTRACT.md.
 *     No such server ships with the repository today.
 *
 * The browser never runs Python and never holds broker keys. Order
 * submission lives on the server, behind the same exact-order check and
 * approval the repository requires.
 */
import type {
  Account, AnalystResult, Bar, Config, NewsResult, OrderRecord, Plan, ProposedOrder, PtrIndexRow, PtrReport,
  Quote, ReplayResult, RiskReport, ScanResult,
} from '../domain/types';

export interface ProviderInfo {
  source: 'demo' | 'connected';
  provider: string;            // "Saved Yahoo fixtures" | "Yahoo via local server"
  delayed: boolean;            // free data is delayed and polled
  asOf: string;                // ISO time of the data
  clock: 'demo' | 'real';
}

export interface ArthlyService {
  info(): Promise<ProviderInfo>;
  account(): Promise<Account>;
  scan(mode: 'orb' | 'daily'): Promise<ScanResult>;
  bars(symbol: string): Promise<{ bars: Bar[]; complete_through: string } | null>;
  news(symbol: string): Promise<NewsResult>;
  quotes(symbols: string[]): Promise<Record<string, Quote>>;
  savedPlan(symbol: string): Promise<Plan | null>;
  replay(plan: Pick<Plan, 'symbol' | 'date' | 'entry' | 'stop' | 'target'>): Promise<ReplayResult | null>;
  /** server-side trader-risk check; the demo adapter returns null (the browser preview is used) */
  riskCheck(order: ProposedOrder, config: Config): Promise<RiskReport | null>;
  /** server-side submission after approval; demo returns a demo order id */
  submitPaperOrder(record: OrderRecord): Promise<{ brokerOrderId: string }>;
  companyResults(tickers: string[]): Promise<AnalystResult[]>;
  disclosures(): Promise<{ index: PtrIndexRow[]; reports: PtrReport[] }>;
}

export class DataError extends Error {
  constructor(public kind: 'disconnected' | 'error', message: string) { super(message); }
}
