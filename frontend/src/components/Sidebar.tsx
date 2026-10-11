type Props = {
  active: string;
  onChange: (tab: string) => void;
};

const items = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'stock', label: 'Остатки', icon: '📦' },
  { id: 'stoplist', label: 'Стоп-лист', icon: '🚫' },
  { id: 'hot', label: 'Горячие', icon: '🔥' },
  { id: 'orders', label: 'Заказы', icon: '🧾' },
];

export default function Sidebar({ active, onChange }: Props) {
  return (
    <aside className="w-60 shrink-0 border-r border-gray-800 bg-[#0d1220] flex flex-col">
      <div className="px-5 py-6 border-b border-gray-800">
        <div className="text-lg font-semibold tracking-tight">
          <span className="text-emerald-400">●</span> Restaurant
        </div>
        <div className="text-xs text-gray-500 mt-1">Inventory & Stop-list</div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => {
          const isActive = active === it.id;
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
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
        Hackathon build · v0.1
      </div>
    </aside>
  );
}