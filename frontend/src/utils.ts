export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

export function expiryInfo(expiry: string | null): {
  label: string;
  color: string;
  bg: string;
} {
  if (!expiry) return { label: '—', color: 'text-gray-500', bg: 'bg-gray-800' };

  const now = Date.now();
  const exp = new Date(expiry).getTime();
  const hoursLeft = (exp - now) / (1000 * 60 * 60);

  if (hoursLeft < 0) {
    return {
      label: 'просрочено',
      color: 'text-red-300',
      bg: 'bg-red-950/60 border border-red-800',
    };
  }
  if (hoursLeft < 12) {
    return {
      label: `${Math.floor(hoursLeft)} ч`,
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
  const days = Math.floor(hoursLeft / 24);
  return {
    label: `${days} дн.`,
    color: 'text-emerald-300',
    bg: 'bg-emerald-950/60 border border-emerald-800',
  };
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