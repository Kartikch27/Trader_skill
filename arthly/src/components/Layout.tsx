import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bell, BookOpen, ClipboardList, LayoutDashboard, LineChart, MoreHorizontal, Search, Settings, X, Database, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { useNow, useT } from '../state/hooks';
import { Segmented } from './ui';
import { clock12 } from '../domain/format';
import type { Key } from '../i18n/dict';

const NAV: { to: string; key: Key; icon: typeof Search; primary: boolean }[] = [
  { to: '/', key: 'nav.overview', icon: LayoutDashboard, primary: true },
  { to: '/find', key: 'nav.find', icon: Search, primary: true },
  { to: '/workspace', key: 'nav.workspace', icon: LineChart, primary: true },
  { to: '/orders', key: 'nav.orders', icon: ClipboardList, primary: true },
  { to: '/research', key: 'nav.research', icon: BookOpen, primary: false },
  { to: '/alerts', key: 'nav.alerts', icon: Bell, primary: false },
  { to: '/settings', key: 'nav.settings', icon: Settings, primary: false },
];

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg aria-hidden viewBox="0 0 32 32" className="h-8 w-8"><rect width="32" height="32" rx="8" fill="rgb(var(--primary))" /><path d="M8 22l5-7 4 4 7-10" fill="none" stroke="rgb(var(--primary-ink))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="text-lg font-semibold tracking-tight">Arthly</span>
    </div>
  );
}

export function StatusBadges({ compact }: { compact?: boolean }) {
  const t = useT();
  const source = useStore((s) => s.prefs.dataSource);
  const now = useNow();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="chip bg-info-soft text-info" title={t('term.paper.def')}><ShieldCheck aria-hidden className="h-3.5 w-3.5" />{t('badge.paper')}</span>
      <span className={`chip ${source === 'demo' ? 'bg-warn-soft text-warn' : 'bg-pos-soft text-pos'}`}><Database aria-hidden className="h-3.5 w-3.5" />{source === 'demo' ? t('badge.demo') : t('badge.connected')}</span>
      {!compact && now.demo && <span className="chip bg-sunken text-muted num">{t('demo.clock', { time: clock12(now.time) })}</span>}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT();
  const mode = useStore((s) => s.prefs.mode);
  const lang = useStore((s) => s.prefs.lang);
  const setPref = useStore((s) => s.setPref);
  const source = useStore((s) => s.prefs.dataSource);
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { setMore(false); mainRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [more]);

  const toggles = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented size="sm" label={t('mode.label')} value={mode} onChange={(v) => setPref('mode', v)} options={[{ value: 'beginner', label: t('mode.beginner') }, { value: 'pro', label: t('mode.pro') }]} />
      <Segmented size="sm" label={t('lang.label')} value={lang} onChange={(v) => setPref('lang', v)} options={[{ value: 'en', label: 'EN' }, { value: 'hi', label: 'Hinglish' }]} />
    </div>
  );

  return (
    <div className="min-h-full lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-ink">{t('nav.skip')}</a>

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="px-2"><Logo /></div>
        <p className="mt-1 px-2 text-xs text-muted">{t('app.tagline')}</p>
        <nav aria-label="Main" className="mt-6 flex-1 space-y-0.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-primary/10 text-primary' : 'text-ink hover:bg-sunken'}`}>
              <n.icon aria-hidden className="h-4 w-4" />{t(n.key)}
            </NavLink>
          ))}
        </nav>
        <p className="px-2 text-[11px] leading-relaxed text-muted">{t('disclaimer')}</p>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
            <div className="lg:hidden"><Logo /></div>
            <div className="hidden lg:block"><StatusBadges /></div>
            <div className="hidden sm:block">{toggles}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 sm:hidden">{toggles}</div>
          <div className="px-4 pb-2 lg:hidden sm:px-6"><StatusBadges compact /></div>
        </header>

        {source === 'demo' && (
          <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
            <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-ink">{t('demo.banner')}</p>
          </div>
        )}

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-28 pt-5 outline-none sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => n.primary).map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${isActive ? 'text-primary' : 'text-muted'}`}>
                <n.icon aria-hidden className="h-5 w-5" /><span className="truncate" aria-hidden>{t(n.key.replace('nav.', 'nav.short.') as Key)}</span><span className="sr-only">{t(n.key)}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" aria-expanded={more} aria-controls="more-sheet" onClick={() => setMore(true)} className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
              <MoreHorizontal aria-hidden className="h-5 w-5" />{t('nav.more')}
            </button>
          </li>
        </ul>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
          <button type="button" aria-label={t('common.cancel')} className="absolute inset-0 bg-black/40" onClick={() => setMore(false)} />
          <div id="more-sheet" className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{t('nav.more')}</span>
              <button type="button" className="btn-ghost px-2" onClick={() => setMore(false)} aria-label={t('common.cancel')} autoFocus><X aria-hidden className="h-5 w-5" /></button>
            </div>
            <ul className="space-y-1">
              {NAV.filter((n) => !n.primary).map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} className="flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-sunken"><n.icon aria-hidden className="h-5 w-5" />{t(n.key)}</NavLink>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">{t('disclaimer')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
