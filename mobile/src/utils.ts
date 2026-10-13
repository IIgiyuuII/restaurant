import type { Tone } from './theme';

export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

const UNITS: Record<string, string> = { g: 'г', ml: 'мл', pcs: 'шт' };

export function unitLabel(unit: string): string {
  return UNITS[unit] ?? unit;
}

export function formatQty(value: number, unit: string): string {
  return `${formatQuantity(value)} ${unitLabel(unit)}`;
}

export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

// Сервер отдаёт даты вида "2026-10-19 06:21:18.609621+00". Браузер такое понимает,
// а движок Hermes на телефоне — нет, поэтому приводим к нормальному ISO.
export function parseDate(s: string): Date {
  let iso = s.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/T[\d:.]+[+-]\d{2}$/.test(iso)) iso += ':00';
  return new Date(iso);
}

export function hoursUntil(iso: string): number {
  return (parseDate(iso).getTime() - Date.now()) / 3_600_000;
}

export function expiryByHours(h: number): { label: string; tone: Tone } {
  if (h <= 0) return { label: 'просрочено', tone: 'red' };
  if (h < 1) return { label: `${Math.max(1, Math.floor(h * 60))} мин`, tone: 'red' };
  if (h < 12) {
    const hh = Math.floor(h);
    const m = Math.floor((h - hh) * 60);
    return { label: `${hh} ч ${m} мин`, tone: 'red' };
  }
  if (h < 48) return { label: `${Math.floor(h)} ч`, tone: 'yellow' };
  return { label: `${Math.floor(h / 24)} дн.`, tone: 'green' };
}

export function expiryInfo(expiry: string | null): { label: string; tone: Tone } {
  if (!expiry) return { label: '—', tone: 'gray' };
  return expiryByHours(hoursUntil(expiry));
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = parseDate(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatMoney(value: number): string {
  const s = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
}