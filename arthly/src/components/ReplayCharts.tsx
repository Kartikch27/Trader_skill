import type { ReplayResult } from '../domain/types';
import { useT } from '../state/hooks';
import { pctOf, price as fp } from '../domain/format';

/** Three outcome bars with their numbers written out; patterns as well as colour. */
export function OutcomeBars({ mc }: { mc: ReplayResult['mc'] }) {
  const t = useT();
  const rows = [
    { key: 'target', label: t('replay.targetFirst'), p: mc.p_target, cls: 'bg-pos', pattern: '' },
    { key: 'stop', label: t('replay.stopFirst'), p: mc.p_stop, cls: 'bg-neg', pattern: 'bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(255,255,255,.35)_4px_7px)]' },
    { key: 'neither', label: t('replay.neither', { until: mc.until }), p: mc.p_neither, cls: 'bg-muted', pattern: 'bg-[repeating-linear-gradient(90deg,transparent_0_3px,rgba(255,255,255,.35)_3px_5px)]' },
  ];
  return (
    <ul className="space-y-3" aria-label="Simulated outcomes">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span>{r.label}</span>
            <span className="num font-semibold">{pctOf(r.p)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className={`h-full ${r.cls} ${r.pattern}`} style={{ width: `${r.p * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Simulated percentile bands after the entry, with stop and target lines. */
export function FanChart({ r }: { r: ReplayResult }) {
  const t = useT();
  const { bands, band_times: times } = r.mc;
  const W = 640, H = 240, L = 40, R = 104, T = 12, B = 26;
  const lo = Math.min(...bands.map((b) => b[0]), r.plan.stop) - 0.5;
  const hi = Math.max(...bands.map((b) => b[4]), r.plan.target) + 0.5;
  const x = (i: number) => L + (i / (bands.length - 1)) * (W - L - R);
  const y = (p: number) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);
  const area = (a: number, b: number) =>
    `M${bands.map((q, i) => `${x(i)},${y(q[a])}`).join('L')}L${bands.map((q, i) => [i, q] as const).reverse().map(([i, q]) => `${x(i)},${y(q[b])}`).join('L')}Z`;
  const median = `M${bands.map((q, i) => `${x(i)},${y(q[2])}`).join('L')}`;
  const ticks = [0, Math.floor(times.length / 3), Math.floor((2 * times.length) / 3), times.length - 1];
  const yTicks = [lo + 0.5, (lo + hi) / 2, hi - 0.5];
  const lastB = bands[bands.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${t('replay.fan')}. At ${r.mc.until}: 5th percentile ${fp(lastB[0])}, 25th ${fp(lastB[1])}, median ${fp(lastB[2])}, 75th ${fp(lastB[3])}, 95th ${fp(lastB[4])}. Stop ${fp(r.plan.stop)}, target ${fp(r.plan.target)}.`}>
        {yTicks.map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="rgb(var(--chart-grid))" />
            <text x={L - 6} y={y(p) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))" className="num">{p.toFixed(0)}</text>
          </g>
        ))}
        <path d={area(0, 4)} fill="rgb(var(--primary) / 0.12)" />
        <path d={area(1, 3)} fill="rgb(var(--primary) / 0.25)" />
        <path d={median} fill="none" stroke="rgb(var(--primary))" strokeWidth="2" />
        <line x1={L} x2={W - R} y1={y(r.plan.target)} y2={y(r.plan.target)} stroke="rgb(var(--pos))" strokeDasharray="6 4" strokeWidth="1.5" />
        <text x={W - R + 4} y={y(r.plan.target) + 4} fontSize="11" fill="rgb(var(--pos))">Target {fp(r.plan.target)}</text>
        <line x1={L} x2={W - R} y1={y(r.plan.stop)} y2={y(r.plan.stop)} stroke="rgb(var(--neg))" strokeDasharray="2 3" strokeWidth="1.5" />
        <text x={W - R + 4} y={y(r.plan.stop) + 4} fontSize="11" fill="rgb(var(--neg))">Stop {fp(r.plan.stop)}</text>
        <line x1={L} x2={W - R} y1={y(r.plan.entry)} y2={y(r.plan.entry)} stroke="rgb(var(--muted))" strokeWidth="1" />
        <text x={W - R + 4} y={y(r.plan.entry) + 4} fontSize="11" fill="rgb(var(--muted))">Entry {fp(r.plan.entry)}</text>
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="rgb(var(--muted))">{times[i]}</text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-5 rounded-sm bg-primary/25" />50% of paths</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-5 rounded-sm bg-primary/10" />90% of paths</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0 w-5 border-t-2 border-primary" />median</span>
        <span>{t('replay.fanNote')}</span>
      </figcaption>
      <table className="table-pro mt-3 w-full text-left">
        <caption className="sr-only">Simulated price percentiles at {r.mc.until}</caption>
        <thead><tr><th>At {r.mc.until}</th><th>5th</th><th>25th</th><th>Median</th><th>75th</th><th>95th</th></tr></thead>
        <tbody><tr><td className="text-muted">Simulated</td>{lastB.map((v, i) => <td key={i}>{fp(v)}</td>)}</tr></tbody>
      </table>
    </figure>
  );
}

export function CloseHistogram({ r }: { r: ReplayResult }) {
  const t = useT();
  const { bins, lo, hi } = r.mc.hist;
  const max = Math.max(...bins);
  const step = (hi - lo) / bins.length;
  const W = 640, H = 120, L = 8, B = 20;
  const bw = (W - 2 * L) / bins.length;
  const xOf = (p: number) => L + ((p - lo) / (hi - lo)) * (W - 2 * L);
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium">{t('replay.histogram', { until: r.mc.until })}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Histogram of simulated prices at ${r.mc.until}, from ${fp(lo)} to ${fp(hi)}. Median ${fp(r.mc.median_close)}.`}>
        {bins.map((n, i) => {
          const mid = lo + step * (i + 0.5);
          const cls = mid <= r.plan.stop ? 'rgb(var(--neg) / 0.6)' : mid >= r.plan.target ? 'rgb(var(--pos) / 0.6)' : 'rgb(var(--muted) / 0.45)';
          const h = (n / max) * (H - B - 4);
          return <rect key={i} x={L + i * bw + 1} y={H - B - h} width={bw - 2} height={h} fill={cls}><title>{`${fp(lo + step * i)}–${fp(lo + step * (i + 1))}: ${n}`}</title></rect>;
        })}
        <line x1={xOf(r.plan.stop)} x2={xOf(r.plan.stop)} y1={0} y2={H - B} stroke="rgb(var(--neg))" strokeDasharray="2 3" />
        <line x1={xOf(r.plan.target)} x2={xOf(r.plan.target)} y1={0} y2={H - B} stroke="rgb(var(--pos))" strokeDasharray="6 4" />
        <text x={L} y={H - 4} fontSize="11" fill="rgb(var(--muted))">{fp(lo)}</text>
        <text x={W - L} y={H - 4} fontSize="11" textAnchor="end" fill="rgb(var(--muted))">{fp(hi)}</text>
        <text x={xOf(r.mc.median_close)} y={H - 4} fontSize="11" textAnchor="middle" fill="rgb(var(--ink))">median {fp(r.mc.median_close)}</text>
      </svg>
    </figure>
  );
}
