import type { Product } from '../types';
import { expiryInfo, formatDate, formatQuantity } from '../utils';

type Props = { products: Product[] };

export default function StockTable({ products }: Props) {
  if (products.length === 0) {
    return (
      <div className="text-center text-gray-500 py-16">
        Нет данных
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0d1220]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-800">
            <th className="px-4 py-3 font-medium">Продукт</th>
            <th className="px-4 py-3 font-medium text-right">Остаток</th>
            <th className="px-4 py-3 font-medium">Ед.</th>
            <th className="px-4 py-3 font-medium">Ближайший срок</th>
            <th className="px-4 py-3 font-medium">Статус</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const info = expiryInfo(p.nearest_expiry);
            const isEmpty = p.quantity === 0;
            return (
              <tr
                key={p.id}
                className="border-b border-gray-900 last:border-0 hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-gray-200">{p.name}</td>
                <td className={'px-4 py-3 text-right font-mono ' + (isEmpty ? 'text-gray-600' : 'text-gray-100')}>
                  {formatQuantity(p.quantity)}
                </td>
                <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                <td className="px-4 py-3 text-gray-400">{formatDate(p.nearest_expiry)}</td>
                <td className="px-4 py-3">
                  {isEmpty ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-gray-800 text-gray-400">
                      пусто
                    </span>
                  ) : (
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-md text-xs ' + info.bg + ' ' + info.color}>
                      {info.label}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}