import { useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../state/hooks';
import { Banner, Card, Field, NumberInput, PageHeader, Segmented } from '../components/ui';
import type { SimState } from '../domain/types';

export function Settings() {
  const t = useT();
  const prefs = useStore((s) => s.prefs);
  const setPref = useStore((s) => s.setPref);
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const resetDemo = useStore((s) => s.resetDemo);
  const [blocked, setBlocked] = useState(config.blocked.join(', '));
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader title={t('set.title')} />

      <Card title={t('set.display')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="mb-1 text-sm font-medium">{t('mode.label')}</p><Segmented label={t('mode.label')} value={prefs.mode} onChange={(v) => setPref('mode', v)} options={[{ value: 'beginner', label: t('mode.beginner') }, { value: 'pro', label: t('mode.pro') }]} /></div>
          <div><p className="mb-1 text-sm font-medium">{t('lang.label')}</p><Segmented label={t('lang.label')} value={prefs.lang} onChange={(v) => setPref('lang', v)} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'Hinglish' }]} /></div>
          <div><p className="mb-1 text-sm font-medium">{t('theme.label')}</p><Segmented label={t('theme.label')} value={prefs.theme} onChange={(v) => setPref('theme', v)} options={[{ value: 'system', label: t('theme.system') }, { value: 'light', label: t('theme.light') }, { value: 'dark', label: t('theme.dark') }]} /></div>
        </div>
      </Card>

      <Card title={t('set.data')}>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">{t('set.dataSource')}</p>
            <Segmented label={t('set.dataSource')} value={prefs.dataSource} onChange={(v) => setPref('dataSource', v)} options={[{ value: 'demo', label: t('set.demo') }, { value: 'connected', label: t('set.connected') }]} />
          </div>
          {prefs.dataSource === 'connected' && (
            <Field htmlFor="srv" label={t('set.serverUrl')} hint="The proposed local server in docs/BACKEND_CONTRACT.md. It keeps broker keys in its own environment, never in this browser.">
              <input id="srv" className="input" value={prefs.serverUrl} onChange={(e) => setPref('serverUrl', e.target.value)} />
            </Field>
          )}
          <div>
            <p className="mb-1 text-sm font-medium">{t('set.accountMode')}</p>
            <Segmented label={t('set.accountMode')} value="paper" onChange={() => {}} options={[{ value: 'paper', label: t('badge.paper') }, { value: 'live', label: t('badge.live'), disabled: true }]} />
            <p className="mt-1 text-xs text-muted">{t('set.liveDisabled')}</p>
          </div>
          <Banner tone="muted" title={t('set.markets')}>{t('set.marketsNote')}</Banner>
        </div>
      </Card>

      <Card title={t('set.rules')}>
        <p className="mb-4 text-xs text-muted">{t('set.rulesNote')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field htmlFor="c-budget" label="Budget ($)"><NumberInput id="c-budget" value={config.budget} onChange={(v) => setConfig({ budget: v ?? 0 })} step={100} /></Field>
          <Field htmlFor="c-loss" label="Max loss per trade ($)"><NumberInput id="c-loss" value={config.max_loss_per_trade_usd} onChange={(v) => setConfig({ max_loss_per_trade_usd: v ?? 0 })} step={5} /></Field>
          <Field htmlFor="c-daily" label={t('set.dailyLoss')}><NumberInput id="c-daily" value={config.max_daily_loss_usd} onChange={(v) => setConfig({ max_daily_loss_usd: v ?? 0 })} step={10} /></Field>
          <Field htmlFor="c-trades" label={t('set.tradesDay')}><NumberInput id="c-trades" value={config.max_trades_per_day} onChange={(v) => setConfig({ max_trades_per_day: Math.max(0, Math.round(v ?? 0)) })} step={1} /></Field>
          <Field htmlFor="c-orders" label="Orders per day"><NumberInput id="c-orders" value={config.max_orders_per_day} onChange={(v) => setConfig({ max_orders_per_day: Math.max(0, Math.round(v ?? 0)) })} step={1} /></Field>
          <Field htmlFor="c-rr" label={t('set.minRR')}><NumberInput id="c-rr" value={config.min_reward_risk} onChange={(v) => setConfig({ min_reward_risk: v ?? 0 })} step={0.1} /></Field>
          <Field htmlFor="c-buf" label="Cash buffer (%)"><NumberInput id="c-buf" value={config.cash_buffer_pct} onChange={(v) => setConfig({ cash_buffer_pct: v ?? 0 })} step={1} /></Field>
          <Field htmlFor="c-pos" label="Max position (% of budget)"><NumberInput id="c-pos" value={config.max_position_pct} onChange={(v) => setConfig({ max_position_pct: v ?? 0 })} step={5} /></Field>
          <Field htmlFor="c-max" label="Max order ($)"><NumberInput id="c-max" value={config.max_order_usd} onChange={(v) => setConfig({ max_order_usd: v ?? 0 })} step={100} /></Field>
          <Field htmlFor="c-min" label="Min order ($)"><NumberInput id="c-min" value={config.min_order_usd} onChange={(v) => setConfig({ min_order_usd: v ?? 0 })} step={1} /></Field>
          <Field htmlFor="c-from" label={`${t('set.window')}: from`}><input id="c-from" type="time" className="input" value={config.no_entries_before ?? ''} onChange={(e) => setConfig({ no_entries_before: e.target.value || null })} /></Field>
          <Field htmlFor="c-to" label={`${t('set.window')}: until`}><input id="c-to" type="time" className="input" value={config.no_entries_after ?? ''} onChange={(e) => setConfig({ no_entries_after: e.target.value || null })} /></Field>
          <Field htmlFor="c-flat" label={t('set.flatBy')}><input id="c-flat" type="time" className="input" value={config.flat_by} onChange={(e) => setConfig({ flat_by: e.target.value })} /></Field>
          <Field htmlFor="c-blocked" label={t('set.blocked')}>
            <input id="c-blocked" className="input uppercase" value={blocked} onChange={(e) => setBlocked(e.target.value)} onBlur={() => setConfig({ blocked: blocked.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean) })} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={config.require_stop} onChange={(e) => setConfig({ require_stop: e.target.checked })} />Require a stop on every entry</label>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={config.pdt_guard} onChange={(e) => setConfig({ pdt_guard: e.target.checked })} />{t('set.pdt')}</label>
        </div>
        <p className="mt-4 text-xs text-muted">{t('set.offFeatures')}</p>
      </Card>

      <Card title={t('set.states')}>
        <p className="mb-3 text-xs text-muted">{t('set.statesNote')}</p>
        <Segmented<SimState> label={t('set.states')} value={prefs.sim} onChange={(v) => setPref('sim', v)} options={(['normal', 'loading', 'empty', 'partial', 'stale', 'disconnected', 'error'] as SimState[]).map((s) => ({ value: s, label: s }))} size="sm" />
        {prefs.dataSource !== 'demo' && <p className="mt-2 text-xs text-muted">Previews apply to demo data only.</p>}
      </Card>

      <Card title={t('set.reset')}>
        <p className="mb-3 text-sm text-muted">{t('set.resetNote')}</p>
        {confirmReset ? (
          <div className="flex gap-2"><button className="btn-danger" onClick={() => { resetDemo(); setConfirmReset(false); }}>{t('set.reset')}</button><button className="btn-secondary" onClick={() => setConfirmReset(false)}>{t('common.cancel')}</button></div>
        ) : <button className="btn-secondary" onClick={() => setConfirmReset(true)}>{t('set.reset')}</button>}
      </Card>

      <Card title={t('set.about')}>
        <div className="space-y-2 text-sm text-muted">
          <p>Arthly is a frontend for <a className="text-primary hover:underline" href="https://github.com/Jakeschincariol/day-trader-skill" target="_blank" rel="noreferrer noopener">day-trader-skill</a> (MIT). Its sizing, exit, entry, rules and fingerprint logic are ports of that repository's Python tools and are tested against their output.</p>
          <p>Charts by <a className="text-primary hover:underline" href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer noopener">TradingView Lightweight Charts</a> (Apache-2.0). Icons by Lucide (ISC).</p>
          <p>{t('disclaimer')}</p>
        </div>
      </Card>
    </div>
  );
}
