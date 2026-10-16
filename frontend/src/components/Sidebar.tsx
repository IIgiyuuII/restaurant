import Icon from './Icons';
import type { IconName } from './Icons';

type Props = {
  active: string;
  onChange: (tab: string) => void;
  /** На узких экранах сайдбар — выезжающее меню. */
  open: boolean;
  onClose: () => void;
  /** Красные счётчики рядом с пунктами меню: { writeoffs: 2 }. */
  badges?: Record<string, number>;
};

const items: { id: string; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'dashboard' },
  { id: 'stock', label: 'Остатки', icon: 'box' },
  { id: 'stoplist', label: 'Стоп-лист', icon: 'ban' },
  { id: 'hot', label: 'Горячие', icon: 'flame' },
  { id: 'orders', label: 'Заказы', icon: 'receipt' },
  { id: 'delivery', label: 'Поставка', icon: 'truck' },
  { id: 'writeoffs', label: 'Списание', icon: 'trash' },
];

/**
 * Вкладка из адреса: '#stock' или '#/stock' → 'stock'.
 * Неизвестное значение или пустой хэш → 'dashboard'.
 */
export function tabFromHash(hash: string): string {
  const id = hash.replace(/^#\/?/, '');
  return items.some((it) => it.id === id) ? id : 'dashboard';
}

export default function Sidebar({ active, onChange, open, onClose, badges = {} }: Props) {
  const activeIndex = items.findIndex((it) => it.id === active);
  return (
    <>
      {/* Затемнение под меню на мобильных */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={
          'bg-surface fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-gray-800 transition-transform duration-200 md:static md:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-400 to-indigo-600 text-white shadow-lg shadow-indigo-500/30">
            <Icon name="sparkles" size={22} />
          </span>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight tracking-tight text-gray-100">Restaurant</div>
          </div>
        </div>

        <nav className="stagger relative flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
          {/* Скользящая плашка активного пункта: высота пункта 2.5rem + зазор 0.375rem */}
          {activeIndex >= 0 && (
            <span
              aria-hidden="true"
              className="no-stagger pointer-events-none absolute inset-x-3 top-2 h-10 rounded-xl bg-accent-soft transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]"
              style={{ transform: `translateY(${activeIndex * 2.875}rem)` }}
            />
          )}
          {items.map((it) => {
            const isActive = active === it.id;
            const badge = badges[it.id] ?? 0;
            return (
              <button
                key={it.id}
                onClick={() => onChange(it.id)}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ' +
                  (isActive ? 'text-accent-text' : 'text-gray-400 hover:bg-hover hover:text-gray-100')
                }
              >
                <Icon name={it.icon} size={20} />
                <span className="flex-1 text-left">{it.label}</span>
                {badge > 0 && (
                  <span className="min-w-5 rounded-full bg-red-500/90 px-1.5 text-center text-xs font-medium leading-5 text-white">
                    {badge}
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
