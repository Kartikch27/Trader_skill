import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../../state/store';
import { useT } from '../../state/hooks';
import { useJourney } from '../../state/journey';
import { Banner, Empty, PageHeader } from '../../components/ui';
import { nyDateTime } from '../../domain/format';
import type { Key } from '../../i18n/dict';
import { ContextStep } from './ContextStep';
import { EntryStep } from './EntryStep';
import { ExitStep } from './ExitStep';
import { ReplayStep } from './ReplayStep';
import { SizeStep } from './SizeStep';
import { ReviewStep } from './ReviewStep';

export const STEPS = ['context', 'entry', 'exit', 'replay', 'size', 'review'] as const;
export type Step = (typeof STEPS)[number];

export function Workspace() {
  const t = useT();
  const { step = 'context' } = useParams();
  const nav = useNavigate();
  const symbol = useStore((s) => s.symbol);
  const syncDraft = useStore((s) => s.syncDraft);
  const j = useJourney();

  // Any change to the order or its plan supersedes the draft: old checks and approvals stop counting.
  useEffect(() => {
    if (j.plan) syncDraft(j.order, j.plan.version);
  }, [j.fp, j.plan?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!STEPS.includes(step as Step)) return <Navigate to="/workspace/context" replace />;
  if (!symbol) {
    return (
      <div>
        <PageHeader title={t('ws.title')} />
        <div className="card"><Empty title={t('ws.noSymbol')} action={<Link className="btn-primary" to="/find">{t('nav.find')}</Link>} /></div>
      </div>
    );
  }
  const idx = STEPS.indexOf(step as Step);
  const planForOther = j.plan && j.plan.inputs.symbol !== symbol;
  const done: Record<Step, boolean> = {
    context: true,
    entry: !!j.plan,
    exit: !!j.plan && !planForOther,
    replay: !!j.plan && !planForOther,
    size: !!j.active?.check,
    review: !!j.active && ['approved', 'submitted', 'partially_filled', 'filled'].includes(j.active.state),
  };
  const go = (d: number) => nav(`/workspace/${STEPS[Math.min(STEPS.length - 1, Math.max(0, idx + d))]}`);

  return (
    <div className="space-y-4">
      <PageHeader
        title={<span className="flex flex-wrap items-baseline gap-x-3">{symbol}<span className="text-base font-normal text-muted">{t('ws.title')}</span></span>}
        subtitle={j.plan && !planForOther ? t('ws.planVersion', { v: j.plan.version, time: nyDateTime(j.plan.savedAt) }) : t('ws.longOnly')}
      />

      <nav aria-label={t('ws.title')}>
        <ol className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
          {STEPS.map((s, i) => (
            <li key={s} className={`min-w-0 flex-1 ${s === step ? '' : 'max-sm:hidden'}`}>
              <Link
                to={`/workspace/${s}`}
                aria-current={s === step ? 'step' : undefined}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium sm:text-sm ${s === step ? 'bg-primary text-primary-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`}
              >
                <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${s === step ? 'bg-primary-ink/20' : done[s] ? 'bg-pos-soft text-pos' : 'bg-sunken'}`}>
                  {done[s] && s !== step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {t(`ws.step.${s}` as Key)}
                {done[s] && s !== step && <span className="sr-only">(done)</span>}
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-1 text-center text-xs text-muted sm:hidden">{idx + 1} / {STEPS.length}</p>
      </nav>

      {planForOther && idx >= 2 && <Banner tone="warn">Your saved plan v{j.plan!.version} is for {j.plan!.inputs.symbol}. Saving an exit plan here starts a new plan for {symbol}.</Banner>}

      <div>
        {step === 'context' && <ContextStep symbol={symbol} />}
        {step === 'entry' && <EntryStep symbol={symbol} />}
        {step === 'exit' && <ExitStep symbol={symbol} />}
        {step === 'replay' && <ReplayStep symbol={symbol} />}
        {step === 'size' && <SizeStep symbol={symbol} />}
        {step === 'review' && <ReviewStep symbol={symbol} />}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <button className="btn-secondary" disabled={idx === 0} onClick={() => go(-1)}><ChevronLeft aria-hidden className="h-4 w-4" />{t('common.back')}</button>
        {idx < STEPS.length - 1 && <button className="btn-ghost text-muted" onClick={() => go(1)}>{t('common.skipTo', { step: t(`ws.step.${STEPS[idx + 1]}` as Key) })}<ChevronRight aria-hidden className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}
