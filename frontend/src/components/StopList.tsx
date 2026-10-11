import type { StopDish } from '../types';

type Props = { dishes: StopDish[] };

export default function StopList({ dishes }: Props) {
  if (dishes.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-6 text-emerald-300">
        Стоп-лист пуст — все блюда доступны 🎉
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-5">
      <div className="text-sm text-red-400 mb-3">
        {dishes.length} {dishes.length === 1 ? 'блюдо' : 'блюд'} недоступно
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {dishes.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-3 rounded-lg border border-gray-800 bg-[#0d1220] px-3 py-2.5"
          >
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-gray-200">{d.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}