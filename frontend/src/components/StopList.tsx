import type { StopDish } from '../types';
import { formatDate, plural } from '../utils';
import Icon from './Icons';

type Props = {
  dishes: StopDish[];
  /** Для дашборда: заголовок внутри карточки, не больше 5 строк, ссылка «Все в стоп-листе». */
  compact?: boolean;
  onAll?: () => void;
};

const COMPACT_LIMIT = 5;

export default function StopList({ dishes, compact, onAll }: Props) {
  if (dishes.length === 0) {
    return (
      <div className="bg-surface flex items-center gap-2.5 rounded-2xl border border-emerald-800/40 p-6 text-emerald-300">
        <Icon name="checkCircle" size={20} />
        Стоп-лист пуст — все блюда доступны
      </div>
    );
  }

  const rows = compact ? dishes.slice(0, COMPACT_LIMIT) : dishes;
  const hidden = dishes.length - rows.length;
  // Дополнительные поля отображаются только при наличии данных от API.
  const hasCategory = dishes.some((d) => d.category);
  const hasDate = dishes.some((d) => d.stopped_at);

  return (
    <div className="bg-surface rounded-2xl border border-gray-800 p-4 sm:p-5">
      {compact && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2.5 text-base font-semibold text-gray-100 sm:text-lg">
            <Icon name="ban" size={20} className="text-gray-200" />
            Стоп-лист
          </h2>
          {onAll && (
            <button
              onClick={onAll}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-accent-text hover:underline sm:text-sm"
            >
              Все в стоп-листе
              <Icon name="arrowRight" size={14} />
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-inset text-left text-xs text-gray-500">
              <th className="rounded-l-xl px-4 py-2.5 font-medium">Наименование</th>
              {hasCategory && <th className="px-4 py-2.5 font-medium">Категория</th>}
              <th className={'px-4 py-2.5 font-medium ' + (hasDate ? '' : 'rounded-r-xl')}>Чего не хватает</th>
              {hasDate && <th className="rounded-r-xl px-4 py-2.5 font-medium">Дата</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-gray-900 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-100">{d.name}</td>
                {hasCategory && <td className="px-4 py-3 text-gray-400">{d.category ?? '—'}</td>}
                <td className="px-4 py-3 text-gray-300">
                  <span className="inline-flex items-start gap-2 rounded-lg border border-gray-700/70 bg-inset px-3 py-2 text-xs font-medium leading-relaxed text-gray-300">
                    <span>
                      {d.reason || 'Недостаточно доступных ингредиентов для приготовления.'}
                    </span>
                  </span>
                </td>
                {hasDate && <td className="px-4 py-3 whitespace-nowrap text-gray-400">{d.stopped_at ? formatDate(d.stopped_at) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hidden > 0 && (
        <div className="mt-3 px-4 text-xs text-gray-500">
          и ещё {hidden} {plural(hidden, ['блюдо', 'блюда', 'блюд'])}
        </div>
      )}
    </div>
  );
}
