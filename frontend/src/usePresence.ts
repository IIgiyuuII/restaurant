import { useEffect, useState } from 'react';

/**
 * Держит элемент в DOM ещё `ms` миллисекунд после закрытия — чтобы успела проиграться
 * анимация исчезновения. Использование:
 *   const mounted = usePresence(open);
 *   {mounted && <div data-state={open ? 'open' : 'closed'} ... />}
 */
export function usePresence(open: boolean, ms = 160) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, mounted, ms]);

  return mounted;
}
