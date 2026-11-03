import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { ExternalLink, FileText, Landmark } from 'lucide-react';
import { useAsync, useMode, useT } from '../state/hooks';
import { Banner, Card, DataGate, PageHeader, Pill, Segmented } from '../components/ui';
import { compact, pct } from '../domain/format';
import type { AnalystResult, AnalystRow, PtrReport } from '../domain/types';

export function Research() {
  const t = useT();
  const { tab = 'company' } = useParams();
  return (
    <div className="space-y-4">
      <PageHeader title={t('res.title')} />
      <nav aria-label={t('res.title')} className="flex gap-2">
        {[{ to: 'company', label: t('res.company'), icon: FileText }, { to: 'disclosures', label: t('res.disclosures'), icon: Landmark }].map((x) => (
          <NavLink key={x.to} to={`/research/${x.to}`} className={({ isActive }) => `btn ${isActive ? 'bg-primary text-primary-ink' : 'border border-line bg-surface hover:bg-sunken'}`}><x.icon aria-hidden className="h-4 w-4" />{x.label}</NavLink>
        ))}
      </nav>
      {tab === 'disclosures' ? <Disclosures /> : <Company />}
    </div>
  );
}

const money0 = (x?: number | null) => (x == null ? '—' : `$${compact(x)}`);

function Company() {
  const t = useT();
  const mode = useMode();
  const [ticker, setTicker] = useState<'AAPL' | 'KO'>('AAPL');
  const res = useAsync((svc) => svc.companyResults(['AAPL', 'KO']), []);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Company" value={ticker} onChange={setTicker} options={[{ value: 'AAPL', label: 'AAPL' }, { value: 'KO', label: 'KO' }]} />
        <span className="text-xs text-muted">{t('res.noFacts')}</span>
      </div>
      <DataGate state={res} lines={6}>
        {(all) => {
          const a = all.find((x: AnalystResult) => x.ticker === ticker);
          if (!a) return <Card><p className="text-sm text-muted">{t('res.noFacts')}</p></Card>;
          const r = a.result;
          const rows = r.rows.slice(0, mode === 'pro' ? 8 : 4);
          const latest = r.rows[0];
          const edgar = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${r.cik}&type=10-&dateb=&owner=include&count=40`;
          const notes: string[] = [];
          if (latest && latest.net_income != null && latest.operating_income != null && latest.net_income > latest.operating_income) notes.push('Net income is above operating income: gains outside the business (investment marks, tax items) are inside it.');
          if (latest && latest.gross_margin == null) notes.push('No gross margin for this company (banks and insurers have none): blank, not zero.');
          return (
            <>
              <Card title={`${r.entity} (${a.ticker})`} actions={<a className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={edgar} target="_blank" rel="noreferrer noopener">{t('res.filings')}<ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>}>
                <p className="mb-4 text-xs text-muted">{t('res.filedNumbers')}</p>
                {latest && (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Kpi label={`${t('res.revenue')} · ${latest.fiscal}`} v={money0(latest.revenue)} yoy={latest.revenue_yoy} t={t} />
                    <Kpi label={t('res.netIncome')} v={money0(latest.net_income)} yoy={latest.net_income_yoy} t={t} />
                    <Kpi label={t('res.eps')} v={latest.eps_diluted != null ? `$${latest.eps_diluted.toFixed(2)}` : '—'} yoy={latest.eps_yoy} t={t} />
                    <div><div className="text-xs text-muted">{t('res.ttm')}</div><div className="mt-1 text-sm num">{money0(r.ttm.revenue)} revenue · ${r.ttm.eps_diluted.toFixed(2)} EPS</div></div>
                  </div>
                )}
                {latest && <p className="mt-3 text-xs text-muted">{t('res.filed', { date: latest.filed ?? '—', form: latest.form ?? '' })} · period {latest.start} to {latest.end}</p>}
                {notes.map((n) => <Banner key={n} tone="warn">{n}</Banner>)}
              </Card>
              <div className="card overflow-x-auto">
                <table className="table-pro w-full min-w-[720px]">
                  <caption className="sr-only">{r.entity} quarterly results</caption>
                  <thead className="border-b border-line"><tr><th>{t('res.quarter')}</th><th className="text-right">{t('res.revenue')}</th><th className="text-right">{t('res.yoy')}</th><th className="text-right">{t('res.netIncome')}</th><th className="text-right">{t('res.eps')}</th><th className="text-right">{t('res.grossMargin')}</th><th className="text-right">{t('res.opMargin')}</th><th className="text-right">{t('res.netMargin')}</th><th>Form</th></tr></thead>
                  <tbody>
                    {rows.map((q: AnalystRow) => (
                      <tr key={q.end} className="border-b border-line last:border-0">
                        <td>{q.fiscal} {q.derived && <Pill tone="warn">{t('res.derived')}</Pill>}<div className="text-[11px] text-muted">{q.end}</div></td>
                        <td className="text-right">{money0(q.revenue)}</td>
                        <td className={`text-right ${(q.revenue_yoy ?? 0) >= 0 ? 'text-pos' : 'text-neg'}`}>{pct(q.revenue_yoy, 1)}</td>
                        <td className="text-right">{money0(q.net_income)}</td>
                        <td className="text-right">{q.eps_diluted != null ? q.eps_diluted.toFixed(2) : '—'}</td>
                        <td className="text-right">{q.gross_margin != null ? `${q.gross_margin.toFixed(1)}%` : '—'}</td>
                        <td className="text-right">{q.operating_margin != null ? `${q.operating_margin.toFixed(1)}%` : '—'}</td>
                        <td className="text-right">{q.net_margin != null ? `${q.net_margin.toFixed(1)}%` : '—'}</td>
                        <td className="text-xs">{q.form} {q.filed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.some((q) => q.derived) && <p className="text-xs text-muted">{t('res.derivedNote')}</p>}
              <p className="text-xs text-muted">The next report date is not in SEC data. Check the company's investor relations page or the news. Arthly never says a stock is cheap, expensive, a buy or a sell.</p>
            </>
          );
        }}
      </DataGate>
    </div>
  );
}

function Kpi({ label, v, yoy, t }: { label: string; v: string; yoy?: number | null; t: ReturnType<typeof useT> }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold num">{v}</div>
      <div className={`text-xs num ${(yoy ?? 0) >= 0 ? 'text-pos' : 'text-neg'}`}>{pct(yoy, 1)} <span className="text-muted">{t('res.yoy')}</span></div>
    </div>
  );
}

function Disclosures() {
  const t = useT();
  const mode = useMode();
  const res = useAsync((svc) => svc.disclosures(), []);
  return (
    <div className="space-y-4">
      <Banner tone="info" title={t('res.ptrIntro')}>{t('res.ptr.notHeld')}</Banner>
      <DataGate state={res} lines={6}>
        {(d) => (
          <>
            {d.reports.map((r: PtrReport) => (
              <Card key={r.doc_id} title={`${r.name} (${r.district})`} actions={<a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{t('res.ptr.pdf', { id: r.doc_id })}<ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>}>
                <p className="mb-3 text-xs text-muted">{t('res.ptr.filed')}: {r.filed ?? '—'} · Periodic Transaction Report · House Clerk</p>
                {r.excerpt && <Banner tone="warn">{t('res.ptr.excerpt')}</Banner>}
                <ul className="mt-2 divide-y divide-line">
                  {r.rows.map((x, i) => (
                    <li key={i} className={`grid gap-1 py-2.5 text-sm ${mode === 'pro' ? 'sm:grid-cols-6' : 'sm:grid-cols-3'}`}>
                      <div className={mode === 'pro' ? 'sm:col-span-2' : ''}>
                        <p className="font-medium">{x.ticker ? `${x.ticker} · ` : ''}{x.asset}</p>
                        <p className="text-xs text-muted">{x.type_name}{x.owner_name ? ` · ${t('res.ptr.owner')}: ${x.owner_name}` : ''}{x.option ? ` · ${t('res.ptr.option', { n: x.option.contracts ?? '?', kind: x.option.kind ?? '', strike: x.option.strike ?? '?', exp: x.option.expires ?? '?' })}` : ''}</p>
                      </div>
                      <div className="num"><span className="text-xs text-muted">{t('res.ptr.tradeDate')}</span><br />{x.date}</div>
                      <div className="num"><span className="text-xs text-muted">{t('res.ptr.filed')}</span><br />{r.filed ?? '—'} {x.days_to_disclose != null && <span className={`text-xs ${x.late ? 'text-warn' : 'text-muted'}`}>({t('res.ptr.delay', { n: x.days_to_disclose })}{x.late ? `, ${t('res.ptr.late')}` : ''})</span>}</div>
                      <div className={`num ${mode === 'pro' ? 'sm:col-span-2' : 'sm:col-span-3'}`}><span className="text-xs text-muted">{t('res.ptr.amount')}</span><br />{x.amount}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            <Card title="2026 filings index (Pelosi)">
              <ul className="divide-y divide-line text-sm">
                {d.index.map((x) => (
                  <li key={x.doc_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{x.name}</span> · {t('res.ptr.filed')} {x.filed}</span>
                    <a href={x.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">doc {x.doc_id}<ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>
                  </li>
                ))}
              </ul>
            </Card>
            <p className="text-xs text-muted">{t('res.ptr.senate')}</p>
          </>
        )}
      </DataGate>
    </div>
  );
}
