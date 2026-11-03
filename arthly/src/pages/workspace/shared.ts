import { useAsync } from '../../state/hooks';
import type { Bar, ScanHit } from '../../domain/types';

export const PLAN_DAY = '2026-10-19';

/** The scanner hits for a symbol (opening-range and daily), as facts for "why is it here". */
export function useScanHits(symbol: string) {
  return useAsync(async (svc) => {
    const [orb, daily] = await Promise.allSettled([svc.scan('orb'), svc.scan('daily')]);
    const hits: { mode: 'orb' | 'daily'; hit: ScanHit; asOf: string }[] = [];
    if (orb.status === 'fulfilled') { const h = orb.value.hits.find((x) => x.symbol === symbol); if (h) hits.push({ mode: 'orb', hit: h, asOf: orb.value.as_of }); }
    if (daily.status === 'fulfilled') { const h = daily.value.hits.find((x) => x.symbol === symbol); if (h) hits.push({ mode: 'daily', hit: h, asOf: daily.value.as_of }); }
    if (orb.status === 'rejected' && daily.status === 'rejected') throw orb.reason;
    return hits;
  }, [symbol]);
}

export function useBars(symbol: string) {
  return useAsync(async (svc) => {
    const r = await svc.bars(symbol);
    if (!r) return null;
    return { all: r.bars, today: r.bars.filter((b: Bar) => b.ny.startsWith(PLAN_DAY)), completeThrough: r.complete_through };
  }, [symbol]);
}
