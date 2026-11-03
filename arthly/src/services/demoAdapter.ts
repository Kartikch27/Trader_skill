/**
 * Demo adapter: the repository's own saved data, run through its own tools
 * by scripts/build_fixtures.py (Mon 2026-10-19, "the reel"). Every number is
 * real saved data or real tool output; nothing is invented. Prices are from
 * that day, never presented as current.
 */
import type { ArthlyService, ProviderInfo } from './types';
import { DataError } from './types';
import type { AnalystResult, Bar, NewsResult, Plan, PtrIndexRow, PtrReport, Quote, ReplayResult, ScanResult } from '../domain/types';
import scanOrb from '../fixtures/scan-orb.json';
import scanDaily from '../fixtures/scan-daily.json';
import barsTsla from '../fixtures/bars-TSLA.json';
import newsTsla from '../fixtures/news-TSLA.json';
import quotes from '../fixtures/quotes.json';
import planTsla from '../fixtures/plan-TSLA.json';
import replayTsla from '../fixtures/timemachine-TSLA.json';
import analyst from '../fixtures/analyst.json';
import pelosi from '../fixtures/pelosi.json';
import type { SimState } from '../domain/types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoAdapter implements ArthlyService {
  constructor(private sim: () => SimState) {}

  private async gate<T>(value: T, ms = 250): Promise<T> {
    const s = this.sim();
    if (s === 'loading') await new Promise(() => {}); // never resolves: shows the loading state
    await wait(ms);
    if (s === 'disconnected') throw new DataError('disconnected', 'demo: simulated disconnected backend');
    if (s === 'error') throw new DataError('error', 'demo: simulated fetch failure');
    return value;
  }

  info(): Promise<ProviderInfo> {
    const s = this.sim();
    return this.gate({
      source: 'demo', provider: 'Saved Yahoo fixtures (day-trader-skill tests)', delayed: true,
      asOf: s === 'stale' ? '2026-10-19T13:20:00Z' : '2026-10-19T14:15:00Z', clock: 'demo',
    }, 50);
  }

  account() {
    return this.gate({ mode: 'paper' as const, provider: 'demo' as const, cash: 5000, equity: 5000, status: 'DEMO', as_of: '2026-10-19T14:15:00Z' }, 50);
  }

  async scan(mode: 'orb' | 'daily'): Promise<ScanResult> {
    const base = structuredClone(mode === 'orb' ? scanOrb : scanDaily) as unknown as ScanResult;
    const s = this.sim();
    if (s === 'empty') base.hits = [];
    if (s === 'partial') {
      // show the coverage line honestly: drop the last third as "failed"
      const keep = Math.ceil(base.hits.length * 0.66);
      base.failed += base.scanned - Math.ceil(base.scanned * 0.66);
      base.scanned = Math.ceil(base.scanned * 0.66);
      base.hits = base.hits.slice(0, keep);
    }
    return this.gate(base, 400);
  }

  bars(symbol: string) {
    if (symbol !== 'TSLA') return this.gate(null);
    return this.gate({ bars: barsTsla.bars as Bar[], complete_through: barsTsla.complete_through });
  }

  news(symbol: string) {
    const n = structuredClone(newsTsla) as NewsResult;
    if (symbol !== 'TSLA') return this.gate({ checked: n.checked, moves: [], items: [], notes: [`The demo has saved headlines for TSLA only.`] });
    return this.gate(n);
  }

  quotes(symbols: string[]) {
    const q = quotes.quotes as Record<string, Quote>;
    return this.gate(Object.fromEntries(symbols.filter((s) => q[s]).map((s) => [s, q[s]])), 100);
  }

  savedPlan(symbol: string) {
    return this.gate(symbol === 'TSLA' ? (planTsla as Plan) : null, 50);
  }

  replay(p: Pick<Plan, 'symbol' | 'date' | 'entry' | 'stop' | 'target'>) {
    const r = replayTsla as unknown as ReplayResult;
    const same = p.symbol === r.plan.symbol && p.date === r.plan.date && p.entry === r.plan.entry && p.stop === r.plan.stop && p.target === r.plan.target;
    // Only the saved run exists in demo mode; a different plan has no replay.
    return this.gate(same || p.symbol === 'TSLA' ? r : null, 300);
  }

  riskCheck() { return Promise.resolve(null); }

  async submitPaperOrder() {
    await wait(400);
    return { brokerOrderId: `demo-${Math.random().toString(36).slice(2, 10)}` };
  }

  companyResults(tickers: string[]) {
    return this.gate((analyst as unknown as AnalystResult[]).filter((a) => tickers.includes(a.ticker)));
  }

  disclosures() {
    return this.gate(pelosi as unknown as { index: PtrIndexRow[]; reports: PtrReport[] });
  }
}
