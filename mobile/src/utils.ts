export type Tone = 'red' | 'yellow' | 'green' | 'gray';

export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

const UNITS: Record<string, string> = { g: 'г', ml: 'мл', pcs: 'шт' };
export const unitLabel = (unit: string): string => UNITS[unit] ?? unit;
export const formatQty = (value: number, unit: string): string =>
  `${formatQuantity(value)}\u00A0${unitLabel(unit)}`;

/** plural(5, ['порция', 'порции', 'порций']) → «порций». */
export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}
export const PORTIONS: [string, string, string] = ['порция', 'порции', 'порций'];
export const BATCHES: [string, string, string] = ['партия', 'партии', 'партий'];
export const DISHES: [string, string, string] = ['блюдо', 'блюда', 'блюд'];

/**
 * Даты с сервера бывают вида "2026-10-19 06:21:18.609621+00". Браузер такое понимает,
 * а движок Hermes на телефоне — нет, поэтому приводим к нормальному ISO.
 */
export function parseDate(s: string): Date {
  let iso = s.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/T[\d:.]+[+-]\d{2}$/.test(iso)) iso += ':00';
  return new Date(iso);
}

export const hoursUntil = (iso: string): number => (parseDate(iso).getTime() - Date.now()) / 3_600_000;

export function expiryByHours(h: number): { label: string; tone: Tone } {
  if (h <= 0) return { label: 'просрочено', tone: 'red' };
  if (h < 1) return { label: `${Math.max(1, Math.floor(h * 60))} мин`, tone: 'red' };
  if (h < 12) {
    const hh = Math.floor(h);
    return { label: `${hh} ч ${Math.floor((h - hh) * 60)} мин`, tone: 'red' };
  }
  if (h < 48) return { label: `${Math.floor(h)} ч`, tone: 'yellow' };
  return { label: `${Math.floor(h / 24)} дн.`, tone: 'green' };
}

export function expiryInfo(expiry: string | null): { label: string; tone: Tone } {
  if (!expiry) return { label: '—', tone: 'gray' };
  return expiryByHours(hoursUntil(expiry));
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = parseDate(iso);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function formatTime(d: Date): string {
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const formatLongDate = (d: Date): string => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export function formatMoney(value: number): string {
  const s = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')}\u00A0₽`;
}

export const formatNumber = (v: number): string =>
  (Math.round(v * 10) / 10).toString().replace('.', ',');

/** Сколько часов назад вышел срок: «3 ч назад». */
export function overdueLabel(expiresAt: string): string {
  const h = -hoursUntil(expiresAt);
  if (h < 1) return `${Math.max(1, Math.floor(h * 60))} мин назад`;
  if (h < 48) return `${Math.floor(h)} ч назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}
