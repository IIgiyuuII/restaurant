
import { useEffect } from 'react';

type Props = {
  active: string;
  onChange: (tab: string) => void;
  open: boolean;
  onClose: () => void;
  cartCount?: number;
};

const items = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'stock', label: 'Остатки', icon: '📦' },
  { id: 'stoplist', label: 'Стоп-лист', icon: '🚫' },
  { id: 'hot', label: 'Горячие', icon: '🔥' },
  { id: 'orders', label: 'Заказы', icon: '🧾' },
];

export default function Sidebar({
  active,
  onChange,
  open,
  onClose,
  cartCount = 0,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-black/60 md:hidden',
          'transition-opacity duration-300 ease-out',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      <aside
        id="app-sidebar"
        aria-label="Основная навигация"
        aria-hidden={!open}
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col',
          'overflow-hidden border-r border-gray-800 bg-[#0d1220]',
          'transform-gpu transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          'md:relative md:inset-auto md:z-auto md:h-full md:max-w-none md:shrink-0',
          open
            ? 'translate-x-0 opacity-100 md:w-64'
            : '-translate-x-full opacity-0 md:w-0 md:-translate-x-2 md:border-r-0',
        ].join(' ')}
      >
        <div className="flex min-h-[88px] shrink-0 items-start justify-between gap-3 border-b border-gray-800 px-5 py-6">
          <div className="min-w-0">
            <div className="whitespace-nowrap text-lg font-semibold tracking-tight">
              <span className="text-emerald-400">●</span> Restaurant
            </div>

            <div className="mt-1 whitespace-nowrap text-xs text-gray-500">
              Inventory &amp; Stop-list
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-2xl leading-none text-gray-500 transition-colors hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:hidden"
            aria-label="Закрыть меню"
          >
            ×
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto p-3">
          {items.map((item) => {
            const isActive = active === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                tabIndex={open ? 0 : -1}
                className={[
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-sm',
                  'transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                  isActive
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                    : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-100',
                ].join(' ')}
              >
                <span className="shrink-0 text-base" aria-hidden="true">
                  {item.icon}
                </span>

                <span className="min-w-0 flex-1 whitespace-nowrap text-left">
                  {item.label}
                </span>

                {item.id === 'orders' && cartCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-semibold text-gray-950">
                    {cartCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
