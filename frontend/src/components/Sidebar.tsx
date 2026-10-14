type Props = {
  active: string;
  onChange: (tab: string) => void;
  /** На узких экранах сайдбар — выезжающее меню. */
  open: boolean;
  onClose: () => void;
  /** Красные счётчики рядом с пунктами меню: { writeoffs: 2 }. */
  badges?: Record<string, number>;
};

const items = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'stock', label: 'Остатки', icon: '📦' },
  { id: 'stoplist', label: 'Стоп-лист', icon: '🚫' },
  { id: 'hot', label: 'Горячие', icon: '🔥' },
  { id: 'orders', label: 'Заказы', icon: '🧾' },
  { id: 'delivery', label: 'Поставка', icon: '🚚' },
  { id: 'writeoffs', label: 'Списание', icon: '🗑️' },
];

export default function Sidebar({ active, onChange, open, onClose, badges = {} }: Props) {
  return (
    <>
      {/* Затемнение под меню на мобильных */}
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-gray-800 bg-[#0d1220] transition-transform duration-200 md:static md:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="px-5 py-6 border-b border-gray-800">
          <div className="text-lg font-semibold tracking-tight">
            <span className="text-emerald-400">●</span> Restaurant
          </div>
          <div className="text-xs text-gray-500 mt-1">Inventory & Stop-list</div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((it) => {
            const isActive = active === it.id;
            const badge = badges[it.id] ?? 0;
            return (
              <button
                key={it.id}
                onClick={() => onChange(it.id)}
                className={
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ' +
                  (isActive
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-white/5 border border-transparent')
                }
              >
                <span className="text-base">{it.icon}</span>
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

        <div className="p-4 border-t border-gray-800 text-xs text-gray-500">Hackathon build · v0.2</div>
      </aside>
    </>
  );
}
