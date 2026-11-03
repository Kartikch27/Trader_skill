import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { translate, type Key } from '../i18n/dict';
import { DemoAdapter } from '../services/demoAdapter';
import { HttpAdapter } from '../services/httpAdapter';
import { DataError, type ArthlyService } from '../services/types';
import { demoInstant, toNy, type NyNow } from '../domain/market';

export function useT() {
  const lang = useStore((s) => s.prefs.lang);
  return useCallback((key: Key, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
}

export function useMode() {
  return useStore((s) => s.prefs.mode);
}

let demo: DemoAdapter | null = null;
const http = new Map<string, HttpAdapter>();

export function useService(): ArthlyService {
  const source = useStore((s) => s.prefs.dataSource);
  const url = useStore((s) => s.prefs.serverUrl);
  return useMemo(() => {
    if (source === 'connected') {
      if (!http.has(url)) http.set(url, new HttpAdapter(url));
      return http.get(url)!;
    }
    if (!demo) demo = new DemoAdapter(() => useStore.getState().prefs.sim);
    return demo;
  }, [source, url]);
}

export type Async<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'disconnected'; message: string }
  | { status: 'error'; message: string };

/** Load data through the service. Re-runs when deps, the source or the simulated state change. */
export function useAsync<T>(fn: (svc: ArthlyService) => Promise<T>, deps: unknown[]): Async<T> & { reload: () => void } {
  const svc = useService();
  const sim = useStore((s) => s.prefs.sim);
  const [state, setState] = useState<Async<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fnRef.current(svc).then(
      (data) => live && setState({ status: 'ready', data }),
      (e: unknown) => {
        if (!live) return;
        if (e instanceof DataError && e.kind === 'disconnected') setState({ status: 'disconnected', message: e.message });
        else setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svc, sim, tick, ...deps]);
  return { ...state, reload: () => setTick((x) => x + 1) } as Async<T> & { reload: () => void };
}

/** New York "now": the demo clock in demo mode, the real clock when connected. */
export function useNow(): NyNow & { demo: boolean } {
  const source = useStore((s) => s.prefs.dataSource);
  const clock = useStore((s) => s.demoClock);
  const [real, setReal] = useState(() => new Date());
  useEffect(() => {
    if (source === 'demo') return;
    const id = setInterval(() => setReal(new Date()), 30_000);
    return () => clearInterval(id);
  }, [source]);
  return useMemo(() => (source === 'demo' ? { ...toNy(demoInstant(clock)), demo: true } : { ...toNy(real), demo: false }), [source, clock, real]);
}

/** Apply the theme to <html data-theme>, following the system when set to "system". */
export function useThemeEffect() {
  const theme = useStore((s) => s.prefs.theme);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function useLangEffect() {
  const lang = useStore((s) => s.prefs.lang);
  useEffect(() => { document.documentElement.lang = lang === 'hi' ? 'hi-Latn' : 'en'; }, [lang]);
}
