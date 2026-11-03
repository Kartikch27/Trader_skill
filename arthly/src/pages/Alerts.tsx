import { useState } from 'react';
import { BellRing, Pencil, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useStore } from '../state/store';
import { useNow, useT } from '../state/hooks';
import { Banner, Card, Field, NumberInput, PageHeader, Pill } from '../components/ui';
import { alertsFromPlan, describeRule, needsSymbol, validateRule } from '../domain/alerts';
import { clock12 } from '../domain/format';
import { useMonitor, runAlertCheck } from './AlertMonitor';
import type { AlertRule, AlertType } from '../domain/types';
import type { Key } from '../i18n/dict';

const TYPES: AlertType[] = ['above', 'below', 'stop', 'target', 'pct_move', 'time', 'opening_bell'];

export function Alerts() {
  const t = useT();
  const now = useNow();
  const alerts = useStore((s) => s.alerts);
  const fired = useStore((s) => s.alertFired);
  const plan = useStore((s) => s.plan);
  const addAlerts = useStore((s) => s.addAlerts);
  const updateAlert = useStore((s) => s.updateAlert);
  const removeAlert = useStore((s) => s.removeAlert);
  const resetAlert = useStore((s) => s.resetAlert);
  const on = useMonitor((m) => m.on);
  const setOn = useMonitor((m) => m.set);
  const last = useMonitor((m) => m.lastCheck);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const active = alerts.filter((a) => !fired[a.id]);
  const rang = alerts.filter((a) => fired[a.id]);

  const fromPlan = () => {
    if (!plan) return;
    const rules = alertsFromPlan({ symbol: plan.inputs.symbol, date: plan.inputs.date, stop: plan.calc.stop, target: plan.calc.target, flat_by: plan.inputs.flatBy, stop_label: plan.calc.stopLabel, target_label: plan.calc.targetLabel });
    addAlerts(rules);
    setMsg(t('al.added', { n: rules.length }) + ': ' + rules.map(describeRule).join('; '));
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('al.title')} actions={<button className="btn-primary" onClick={() => setEditing({ id: '', type: 'above', symbol: plan?.inputs.symbol ?? 'TSLA' })}><Plus aria-hidden className="h-4 w-4" />{t('al.new')}</button>} />

      <Banner tone={on ? 'info' : 'warn'} title={on ? t('al.monitorOn') : t('al.monitorOff')}
        action={<div className="flex shrink-0 flex-wrap gap-2">
          <button className="btn-secondary min-h-[36px] text-xs" onClick={() => { const f = runAlertCheck(now); setMsg(f.length ? f.map((x) => x.message).join(' · ') : `Nothing hit at ${clock12(now.time)} ET.`); }}>{t('al.checkNow')}</button>
          <button className="btn-secondary min-h-[36px] text-xs" onClick={() => setOn(!on)}>{on ? <Square aria-hidden className="h-3.5 w-3.5" /> : <Play aria-hidden className="h-3.5 w-3.5" />}{on ? t('al.monitorStop') : t('al.monitorStart')}</button>
        </div>}>
        {t('al.monitorDemo')}{last ? ` Last check ${last} ET.` : ''}
      </Banner>
      <p className="text-xs text-muted">{t('al.info')}</p>
      {msg && <Banner tone="pos">{msg}</Banner>}

      {plan && <button className="btn-secondary" onClick={fromPlan}><BellRing aria-hidden className="h-4 w-4" />{t('al.fromPlan')} ({plan.inputs.symbol} v{plan.version})</button>}

      {editing && <AlertForm initial={editing} onCancel={() => setEditing(null)} onSave={(r) => { if (editing.id) updateAlert(editing.id, r); else addAlerts([r]); setEditing(null); }} />}

      <Card title={`${t('al.active')} (${active.length})`}>
        {active.length === 0 ? <p className="text-sm text-muted">{t('al.none')}</p> : (
          <ul className="divide-y divide-line">
            {active.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{t(`al.type.${a.type}` as Key)}{a.symbol ? ` · ${a.symbol}` : ''}{a.date ? <span className="text-xs font-normal text-muted"> · {a.date} only</span> : null}</p>
                  <p className="text-xs text-muted">{t('al.rings', { cond: describeRule(a) })}{a.note ? ` (${a.note})` : ''}</p>
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost min-h-[36px] px-2" aria-label={`${t('common.edit')} ${a.id}`} onClick={() => setEditing(a)}><Pencil aria-hidden className="h-4 w-4" /></button>
                  <button className="btn-ghost min-h-[36px] px-2 text-neg" aria-label={`${t('common.remove')} ${a.id}`} onClick={() => removeAlert(a.id)}><Trash2 aria-hidden className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`${t('al.triggered')} (${rang.length})`}>
        {rang.length === 0 ? <p className="text-sm text-muted">{t('al.none')}</p> : (
          <ul className="divide-y divide-line">
            {rang.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="flex items-center gap-2 font-medium"><Pill tone="warn" icon={BellRing}>{t('al.rang', { at: `${fired[a.id].at.replace('T', ' ')} ET` })}</Pill></p>
                  <p className="mt-1">{fired[a.id].message}</p>
                  <p className="text-xs text-muted">{describeRule(a)}</p>
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost min-h-[36px] px-2 text-xs" onClick={() => resetAlert(a.id)}><RotateCcw aria-hidden className="h-4 w-4" />{t('al.reset')}</button>
                  <button className="btn-ghost min-h-[36px] px-2 text-neg" aria-label={`${t('common.remove')} ${a.id}`} onClick={() => removeAlert(a.id)}><Trash2 aria-hidden className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AlertForm({ initial, onSave, onCancel }: { initial: AlertRule; onSave: (r: AlertRule) => void; onCancel: () => void }) {
  const t = useT();
  const [r, setR] = useState<AlertRule>(initial);
  const err = validateRule(r);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof AlertRule>(k: K, v: AlertRule[K]) => setR((x) => ({ ...x, [k]: v }));
  const save = () => {
    setTouched(true);
    if (err) return;
    const id = r.id || `${(r.symbol ?? r.type).toLowerCase()}-${r.type}-${Date.now().toString(36)}`;
    const clean: AlertRule = { id, type: r.type };
    if (needsSymbol(r.type)) clean.symbol = r.symbol;
    if (['above', 'below', 'stop', 'target'].includes(r.type)) clean.price = r.price;
    if (r.type === 'pct_move') { clean.pct = r.pct; if (r.direction) clean.direction = r.direction; }
    if (r.type === 'time') { clean.at = r.at; clean.label = r.label; clean.before_close = r.before_close; }
    if (r.date) clean.date = r.date;
    if (r.rearm) clean.rearm = true;
    if (r.note) clean.note = r.note;
    onSave(clean);
  };
  return (
    <Card title={initial.id ? t('common.edit') : t('al.new')}>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field htmlFor="al-type" label={t('al.type')}>
          <select id="al-type" className="input" value={r.type} onChange={(e) => set('type', e.target.value as AlertType)}>
            {TYPES.map((x) => <option key={x} value={x}>{t(`al.type.${x}` as Key)}</option>)}
          </select>
        </Field>
        {needsSymbol(r.type) && (
          <Field htmlFor="al-sym" label={t('al.symbol')} hint="US-listed stocks only">
            <input id="al-sym" className="input uppercase" value={r.symbol ?? ''} onChange={(e) => set('symbol', e.target.value.toUpperCase().trim())} aria-invalid={touched && !!err && err.includes('ticker') || undefined} />
          </Field>
        )}
        {['above', 'below', 'stop', 'target'].includes(r.type) && (
          <Field htmlFor="al-price" label={t('al.price')}><NumberInput id="al-price" value={r.price} onChange={(v) => set('price', v)} prefix="$" invalid={touched && !!err && err.includes('price')} /></Field>
        )}
        {r.type === 'pct_move' && (
          <>
            <Field htmlFor="al-pct" label={t('al.pct')}><NumberInput id="al-pct" value={r.pct} onChange={(v) => set('pct', v)} suffix="%" step={0.5} /></Field>
            <Field htmlFor="al-dir" label={t('al.direction')}>
              <select id="al-dir" className="input" value={r.direction ?? ''} onChange={(e) => set('direction', (e.target.value || undefined) as AlertRule['direction'])}>
                <option value="">{t('al.either')}</option><option value="up">{t('al.up')}</option><option value="down">{t('al.down')}</option>
              </select>
            </Field>
          </>
        )}
        {r.type === 'time' && (
          <>
            <Field htmlFor="al-at" label={t('al.at')}><input id="al-at" type="time" className="input" value={r.at ?? ''} onChange={(e) => set('at', e.target.value)} /></Field>
            <Field htmlFor="al-label" label={t('al.label')}><input id="al-label" className="input" value={r.label ?? ''} onChange={(e) => set('label', e.target.value)} /></Field>
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={!!r.before_close} onChange={(e) => set('before_close', e.target.checked)} />3 hours earlier on a 1:00 p.m. early close</label>
          </>
        )}
        <Field htmlFor="al-date" label={t('al.date')}><input id="al-date" type="date" className="input" value={r.date ?? ''} onChange={(e) => set('date', e.target.value || undefined)} /></Field>
        {['above', 'below', 'stop', 'target'].includes(r.type) && (
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={!!r.rearm} onChange={(e) => set('rearm', e.target.checked)} />{t('al.rearm')}</label>
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          {!err && <p className="mb-2 text-sm text-muted">{t('al.rings', { cond: describeRule(r) })}</p>}
          {touched && err && <p className="mb-2 text-sm text-neg" role="alert">{err}</p>}
          <div className="flex gap-2"><button type="submit" className="btn-primary">{t('common.save')}</button><button type="button" className="btn-secondary" onClick={onCancel}>{t('common.cancel')}</button></div>
        </div>
      </form>
    </Card>
  );
}
