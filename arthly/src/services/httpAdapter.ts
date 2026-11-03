/**
 * HTTP adapter for the PROPOSED local backend (docs/BACKEND_CONTRACT.md).
 * The repository ships Python CLI tools, not a web API, so every endpoint
 * here is a proposal. Until a server implements them, each call fails with
 * a "disconnected" DataError and the screens say so instead of showing
 * old numbers.
 */
import type { ArthlyService, ProviderInfo } from './types';
import { DataError } from './types';
import type { Account, AnalystResult, Bar, Config, NewsResult, OrderRecord, Plan, ProposedOrder, PtrIndexRow, PtrReport, Quote, ReplayResult, RiskReport, ScanResult } from '../domain/types';

export class HttpAdapter implements ArthlyService {
  constructor(private base: string) {}

  private async get<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base.replace(/\/$/, '')}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new DataError('disconnected', `no answer from ${this.base}`);
    }
    if (!res.ok) throw new DataError('error', `${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  private post<T>(path: string, body: unknown) { return this.get<T>(path, { method: 'POST', body: JSON.stringify(body) }); }

  info() { return this.get<ProviderInfo>('/api/info'); }
  account() { return this.get<Account>('/api/account'); }
  scan(mode: 'orb' | 'daily') { return this.get<ScanResult>(`/api/scan/${mode}`); }
  bars(symbol: string) { return this.get<{ bars: Bar[]; complete_through: string } | null>(`/api/bars/${encodeURIComponent(symbol)}?interval=5m`); }
  news(symbol: string) { return this.get<NewsResult>(`/api/news/${encodeURIComponent(symbol)}`); }
  quotes(symbols: string[]) { return this.get<Record<string, Quote>>(`/api/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`); }
  savedPlan(symbol: string) { return this.get<Plan | null>(`/api/plan/${encodeURIComponent(symbol)}`); }
  replay(plan: Pick<Plan, 'symbol' | 'date' | 'entry' | 'stop' | 'target'>) { return this.post<ReplayResult | null>('/api/replay', plan); }
  riskCheck(order: ProposedOrder, config: Config) { return this.post<RiskReport | null>('/api/risk/check', { order, config }); }
  submitPaperOrder(record: OrderRecord) {
    return this.post<{ brokerOrderId: string }>('/api/orders/paper', { order: record.order, fingerprint: record.fingerprint, approval: record.approval });
  }
  companyResults(tickers: string[]) { return this.get<AnalystResult[]>(`/api/company-results?tickers=${tickers.join(',')}`); }
  disclosures() { return this.get<{ index: PtrIndexRow[]; reports: PtrReport[] }>('/api/disclosures'); }
}
