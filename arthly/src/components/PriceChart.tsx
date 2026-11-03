import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import type { Bar } from '../domain/types';
import { useStore } from '../state/store';
import { useT } from '../state/hooks';
import { price as fp } from '../domain/format';

export interface ChartLine { price: number; label: string; tone: 'entry' | 'stop' | 'target' | 'level' }

const css = (name: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v ? `rgb(${v.split(' ').join(',')})` : '#888';
};
const cssA = (name: string, a: number) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v ? `rgba(${v.split(' ').join(',')},${a})` : `rgba(128,128,128,${a})`;
};

/**
 * Candles + volume with labelled lines. Times are New York wall time
 * (bars carry their NY time; the chart shows it as-is).
 */
export function PriceChart({ bars, lines = [], height = 340, label, sessionFilter, interactive = true }: {
  bars: Bar[]; lines?: ChartLine[]; height?: number; label: string; sessionFilter?: string; interactive?: boolean;
}) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const theme = useStore((s) => s.prefs.theme);
  const [showTable, setShowTable] = useState(false);
  const data = useMemo(() => (sessionFilter ? bars.filter((b) => b.ny.startsWith(sessionFilter)) : bars), [bars, sessionFilter]);

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    const c = createChart(el, {
      height,
      width: el.clientWidth,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('muted'), fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: css('chart-grid') }, horzLines: { color: css('chart-grid') } },
      rightPriceScale: { borderColor: css('line') },
      timeScale: { borderColor: css('line'), timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      handleScroll: interactive,
      handleScale: interactive,
      localization: { priceFormatter: (p: number) => p.toFixed(2) },
    });
    chart.current = c;
    const candles = c.addCandlestickSeries({
      upColor: css('pos'), downColor: css('neg'), borderUpColor: css('pos'), borderDownColor: css('neg'),
      wickUpColor: css('pos'), wickDownColor: css('neg'), priceLineVisible: false,
    });
    // bars carry NY wall time; encode it as UTC so the axis reads New York time
    const ts = (b: Bar) => (Date.parse(`${b.ny.replace(' ', 'T')}:00Z`) / 1000) as UTCTimestamp;
    candles.setData(data.map((b) => ({ time: ts(b), open: b.o, high: b.h, low: b.l, close: b.c })));
    const vol = c.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(data.map((b) => ({ time: ts(b), value: b.v, color: b.c >= b.o ? cssA('pos', 0.35) : cssA('neg', 0.35) })));
    const colors = { entry: css('primary'), stop: css('neg'), target: css('pos'), level: css('warn') };
    const styles = { entry: LineStyle.Solid, stop: LineStyle.Dashed, target: LineStyle.Dashed, level: LineStyle.Dotted };
    for (const l of lines) {
      candles.createPriceLine({ price: l.price, color: colors[l.tone], lineWidth: 2, lineStyle: styles[l.tone], axisLabelVisible: true, title: l.label });
    }
    c.timeScale().fitContent();
    const ro = new ResizeObserver(() => c.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); c.remove(); chart.current = null; };
  }, [data, lines, height, theme, interactive]);

  const last = data[data.length - 1];
  const summary = last
    ? `${label}. ${data.length} five-minute candles to ${last.ny} ET. Last close ${fp(last.c)}. ${lines.map((l) => `${l.label} ${fp(l.price)}`).join(', ')}.`
    : label;

  return (
    <figure>
      <div ref={host} role="img" aria-label={summary} style={{ height }} className="w-full" />
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {lines.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-0 w-5 border-t-2 ${l.tone === 'entry' ? 'border-primary' : l.tone === 'stop' ? 'border-dashed border-neg' : l.tone === 'target' ? 'border-dashed border-pos' : 'border-dotted border-warn'}`} />
            {l.label} <span className="num font-medium text-ink">{fp(l.price)}</span>
          </span>
        ))}
        <button type="button" className="ml-auto underline-offset-2 hover:underline" aria-expanded={showTable} onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Hide' : 'Show'} candle data
        </button>
      </figcaption>
      {showTable && (
        <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-line">
          <table className="table-pro w-full">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-surface"><tr><th>Time (ET)</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead>
            <tbody>
              {data.slice().reverse().map((b) => (
                <tr key={b.t} className="border-t border-line"><td>{b.ny.slice(5)}</td><td>{fp(b.o)}</td><td>{fp(b.h)}</td><td>{fp(b.l)}</td><td>{fp(b.c)}</td><td>{b.v.toLocaleString('en-US')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sr-only">{t('state.delayed')}</p>
    </figure>
  );
}
