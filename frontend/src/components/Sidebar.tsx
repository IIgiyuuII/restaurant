import Icon from './Icons';
import type { IconName } from './Icons';

type Props = {
  active: string;
  /** Вызывается после клика — чтобы закрыть мобильное меню. */
  onNavigate: () => void;
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

/** '#/orders' → 'orders'; '#/' или '' → 'dashboard'. */
export function tabFromHash(hash: string, fallback = 'dashboard'): string {
  const id = hash.replace(/^#\/?/, '').trim();
  return items.some((i) => i.id === id) ? id : fallback;
}

export default function Sidebar({ active, onNavigate, open, onClose, badges = {} }: Props) {
  return (
    <>
      {/* Затемнение под меню на мобильных */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

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
            <div className="truncate text-xs text-gray-500">Inventory & Stop-list</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
          {items.map((it) => {
            const isActive = active === it.id;
            const badge = badges[it.id] ?? 0;
            return (
              // <a href="#/id"> вместо <button onClick>:
              // браузер сам пишет запись в history, «Назад» работает без JS.
              <a
                key={it.id}
                href={`#/${it.id}`}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ' +
                  (isActive
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-gray-400 hover:bg-hover hover:text-gray-100')
                }
              >
                <Icon name={it.icon} size={20} />
                <span className="flex-1 text-left">{it.label}</span>
                {badge > 0 && (
                  <span className="min-w-5 rounded-full bg-red-500/90 px-1.5 text-center text-xs font-medium leading-5 text-white">
                    {badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        <div className="p-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-inset px-3 py-2.5 text-xs text-gray-500">
            <Icon name="sparkles" size={16} className="text-accent-text" />
            Hackathon build · v0.2
          </div>
        </div>
      </aside>
    </>
  );
}