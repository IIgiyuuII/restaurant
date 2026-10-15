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

/** Выбор формы слова: plural(5, ['порция', 'порции', 'порций']) → «порций». */
export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

/** Сколько часов осталось до даты (отрицательное — уже прошла). */
export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

export function expiryByHours(hoursLeft: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (hoursLeft <= 0) {
    return {
      label: 'просрочено',
      color: 'text-red-300',
      bg: 'bg-red-950/60 border border-red-800',
    };
  }
  if (hoursLeft < 1) {
    return {
      label: `${Math.max(1, Math.floor(hoursLeft * 60))} мин`,
      color: 'text-red-300',
      bg: 'bg-red-950/60 border border-red-800',
    };
  }
  if (hoursLeft < 12) {
    const h = Math.floor(hoursLeft);
    const m = Math.floor((hoursLeft - h) * 60);
    return {
      label: `${h} ч ${m} мин`,
      color: 'text-red-300',
      bg: 'bg-red-950/60 border border-red-800',
    };
  }
  if (hoursLeft < 48) {
    return {
      label: `${Math.floor(hoursLeft)} ч`,
      color: 'text-yellow-300',
      bg: 'bg-yellow-950/60 border border-yellow-800',
    };
  }
  return {
    label: `${Math.floor(hoursLeft / 24)} дн.`,
    color: 'text-emerald-300',
    bg: 'bg-emerald-950/60 border border-emerald-800',
  };
}

export function expiryInfo(expiry: string | null): {
  label: string;
  color: string;
  bg: string;
} {
  if (!expiry) return { label: '—', color: 'text-gray-500', bg: 'bg-gray-800' };
  return expiryByHours(hoursUntil(expiry));
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`;
}
