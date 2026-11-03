/** Number formatting. US market only: prices and money are always US dollars. */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('en-US');

export const money = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? '—' : usd.format(x));
export const money0 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? '—' : usd0.format(x));
export const price = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(2));
export const count = (x: number | null | undefined) => (x == null ? '—' : int.format(x));

export function signedMoney(x: number | null | undefined) {
  if (x == null) return '—';
  const s = usd.format(Math.abs(x));
  return x > 0 ? `+${s}` : x < 0 ? `−${s}` : s;
}

export function pct(x: number | null | undefined, digits = 2, signed = true) {
  if (x == null || Number.isNaN(x)) return '—';
  const v = x.toFixed(digits);
  return signed && x > 0 ? `+${v}%` : x < 0 ? `−${Math.abs(x).toFixed(digits)}%` : `${v}%`;
}

export const pctOf = (p: number, digits = 1) => `${(p * 100).toFixed(digits)}%`;

export function compact(x: number | null | undefined) {
  if (x == null) return '—';
  const a = Math.abs(x);
  if (a >= 1e12) return `${(x / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return int.format(x);
}

/** "10:15" -> "10:15 AM" */
export function clock12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function nyDateTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d) + ' ET';
}
