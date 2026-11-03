import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Info, Loader2, PlugZap, RefreshCw, XCircle, MinusCircle } from 'lucide-react';
import { useT } from '../state/hooks';
import type { Key } from '../i18n/dict';
import type { Async } from '../state/hooks';

export type Tone = 'pos' | 'neg' | 'warn' | 'info' | 'muted';

const toneCls: Record<Tone, string> = {
  pos: 'bg-pos-soft text-pos',
  neg: 'bg-neg-soft text-neg',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  muted: 'bg-sunken text-muted',
};
const toneIcon: Record<Tone, typeof Info> = { pos: CheckCircle2, neg: XCircle, warn: AlertTriangle, info: Info, muted: MinusCircle };

/** A status label: always an icon AND words, never colour alone. */
export function Pill({ tone, children, icon }: { tone: Tone; children: ReactNode; icon?: typeof Info }) {
  const I = icon ?? toneIcon[tone];
  return (
    <span className={`chip ${toneCls[tone]}`}>
      <I aria-hidden className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function Card({ title, actions, children, className = '', pad = true, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={`card ${className}`} aria-labelledby={title && id ? `${id}-h` : undefined}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          {title && <h2 id={id ? `${id}-h` : undefined} className="text-sm font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, help, tone, sub }: { label: ReactNode; value: ReactNode; help?: ReactNode; tone?: 'pos' | 'neg'; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold num ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted num">{sub}</div>}
      {help && <p className="mt-1 text-xs leading-relaxed text-muted">{help}</p>}
    </div>
  );
}

/**
 * Jargon on tap, click or keyboard focus. The term is a button; its
 * definition opens beside it and closes on Escape or when focus leaves.
 */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const label = t(`term.${k}` as Key);
  return (
    <span ref={ref} className="relative inline-block" onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 underline decoration-dotted decoration-muted/60 underline-offset-4 hover:decoration-primary"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        aria-label={t('common.whatIsThis', { term: label })}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      >
        {children ?? label}
        <CircleHelp aria-hidden className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-0 top-full z-30 mt-1 block w-64 max-w-[80vw] rounded-lg border border-line bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-lg">
          <span className="mb-1 block font-semibold">{label}</span>
          {t(`term.${k}.def` as Key)}
        </span>
      )}
    </span>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${htmlFor}-err`} className="mt-1 flex items-start gap-1 text-xs text-neg"><XCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
    </div>
  );
}

export function NumberInput({ id, value, onChange, step = 0.01, min, invalid, describedBy, suffix, prefix }: {
  id: string; value: number | undefined | ''; onChange: (v: number | undefined) => void; step?: number; min?: number; invalid?: boolean; describedBy?: string; suffix?: string; prefix?: string;
}) {
  const [text, setText] = useState(value === undefined || value === '' ? '' : String(value));
  useEffect(() => {
    const n = text === '' ? undefined : Number(text);
    if (n !== value) setText(value === undefined || value === '' ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
      <input
        id={id}
        inputMode="decimal"
        type="number"
        step={step}
        min={min}
        className={`input ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-10' : ''}`}
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value === '' ? undefined : Number(e.target.value)); }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ label, options, value, onChange, size = 'md' }: { label: string; options: { value: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const move = (d: number) => {
    let i = idx;
    for (let n = 0; n < options.length; n++) {
      i = (i + d + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    onChange(options[i].value);
    refs.current[i]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap rounded-lg border border-line bg-sunken p-0.5">
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
          }}
          className={`rounded-md font-medium transition-colors disabled:opacity-40 ${size === 'sm' ? 'px-2.5 py-1 text-xs min-h-[32px]' : 'px-3 py-1.5 text-sm min-h-[36px]'} ${o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({ tone, title, children, action }: { tone: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const I = toneIcon[tone];
  return (
    <div role={tone === 'neg' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${tone === 'neg' ? 'border-neg/30 bg-neg-soft' : tone === 'warn' ? 'border-warn/30 bg-warn-soft' : tone === 'pos' ? 'border-pos/30 bg-pos-soft' : tone === 'info' ? 'border-info/30 bg-info-soft' : 'border-line bg-sunken'}`}>
      <I aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${{ pos: 'text-pos', neg: 'text-neg', warn: 'text-warn', info: 'text-info', muted: 'text-muted' }[tone]}`} />
      <div className="min-w-0 flex-1 text-ink">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={title ? 'mt-0.5 text-muted' : ''}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, hint, action, icon }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: typeof Info }) {
  const I = icon ?? Info;
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <I aria-hidden className="h-8 w-8 text-muted" />
      <div className="font-medium">{title}</div>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  const t = useT();
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{t('state.loading')}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-sunken" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Loading / disconnected / error wrapper. "Could not fetch" is never shown as "nothing matched". */
export function DataGate<T>({ state, children, lines }: { state: Async<T> & { reload: () => void }; children: (data: T) => ReactNode; lines?: number }) {
  const t = useT();
  if (state.status === 'loading') return <Skeleton lines={lines} />;
  if (state.status === 'disconnected') {
    return <Empty icon={PlugZap} title={t('state.disconnected')} hint={t('state.disconnectedHint')} action={<button className="btn-secondary" onClick={state.reload}><RefreshCw aria-hidden className="h-4 w-4" />{t('common.retry')}</button>} />;
  }
  if (state.status === 'error') {
    return <Empty icon={XCircle} title={t('state.error')} hint={<>{t('state.errorHint')} <span className="block pt-1 font-mono text-xs">{state.message}</span></>} action={<button className="btn-secondary" onClick={state.reload}><RefreshCw aria-hidden className="h-4 w-4" />{t('common.retry')}</button>} />;
  }
  return <>{children(state.data)}</>;
}

export function Spinner() { return <Loader2 aria-hidden className="h-4 w-4 animate-spin" />; }

/** Disabled control with its reason right beside it. */
export function WhyDisabled({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <p className="mt-2 flex items-start gap-1.5 text-xs text-muted"><Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{reason}</p>;
}

export function Advanced({ children, defaultOpen }: { children: ReactNode; defaultOpen?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <div className="mt-4">
      <button type="button" className="text-sm font-medium text-primary hover:underline" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {open ? t('common.hideAdvanced') : t('common.showAdvanced')}
      </button>
      {open && <div id={id} className="mt-3">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function FactTag({ kind }: { kind: 'fact' | 'explain' }) {
  const t = useT();
  return <span className={`chip ${kind === 'fact' ? 'bg-sunken text-muted' : 'bg-info-soft text-info'}`}>{kind === 'fact' ? t('common.fact') : t('common.explain')}</span>;
}
