/**
 * NYSE session clock. Holidays and early closes for 2026 and 2027 are the
 * same list the repository's tools carry (nyse.com, read 2026-10-13).
 * New York time comes from Intl with America/New_York, never the device zone.
 */

export const HOLIDAYS: Record<string, string> = {
  '2026-01-01': "New Year's Day", '2026-01-19': 'Martin Luther King Jr. Day', '2026-02-16': "Washington's Birthday",
  '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)', '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving Day',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day", '2027-01-18': 'Martin Luther King Jr. Day', '2027-02-15': "Washington's Birthday",
  '2027-03-26': 'Good Friday', '2027-05-31': 'Memorial Day', '2027-06-18': 'Juneteenth (observed)',
  '2027-07-05': 'Independence Day (observed)', '2027-09-06': 'Labor Day', '2027-11-25': 'Thanksgiving Day',
  '2027-12-24': 'Christmas Day (observed)',
};
export const EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);
export const KNOWN_YEARS = new Set([2026, 2027]);

export interface NyNow { date: string; time: string; weekday: number; minutes: number }

/** Wall-clock New York date and time for an instant. */
export function toNy(instant: Date): NyNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date, time, weekday, minutes: hhmmToMin(time) };
}

export const hhmmToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const minToHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export type SessionPhase = 'closed_weekend' | 'closed_holiday' | 'pre_market' | 'open' | 'after_close' | 'unknown_calendar';

export interface Session {
  phase: SessionPhase;
  open: string;
  close: string;
  earlyClose: boolean;
  holiday?: string;
  date: string;
  time: string;
}

export function session(now: NyNow): Session {
  const year = Number(now.date.slice(0, 4));
  const earlyClose = EARLY_CLOSES.has(now.date);
  const base = { open: '09:30', close: earlyClose ? '13:00' : '16:00', earlyClose, date: now.date, time: now.time };
  if (!KNOWN_YEARS.has(year)) return { ...base, phase: 'unknown_calendar' };
  if (now.weekday === 0 || now.weekday === 6) return { ...base, phase: 'closed_weekend' };
  if (HOLIDAYS[now.date]) return { ...base, phase: 'closed_holiday', holiday: HOLIDAYS[now.date] };
  if (now.minutes < hhmmToMin(base.open)) return { ...base, phase: 'pre_market' };
  if (now.minutes >= hhmmToMin(base.close)) return { ...base, phase: 'after_close' };
  return { ...base, phase: 'open' };
}

/** The entry window, moved up with a 1:00 p.m. early close, as the tools do. */
export function entryWindow(s: Session, before: string | null, after: string | null) {
  const shift = s.earlyClose ? 180 : 0;
  return {
    from: before,
    to: after ? minToHhmm(hhmmToMin(after) - shift) : null,
  };
}

/** Flat-by time on an early close moves up by 3 hours (15:55 -> 12:55). */
export function flatByFor(s: Session, flatBy: string) {
  return s.earlyClose ? minToHhmm(hhmmToMin(flatBy) - 180) : flatBy;
}

/** A demo instant: New York wall time on the reel's day, as a real Date (EDT, UTC-4). */
export function demoInstant(hhmm: string, date = '2026-10-19') {
  return new Date(`${date}T${hhmm}:00-04:00`);
}
