import type { Cart, HotOffer } from '../types';
import HotOfferCard from './HotOfferCard';

type Props = {
  offers: HotOffer[];
  cart: Cart;
  onAdd: (offer: HotOffer) => void;
  onOpenOrders: () => void;
};

export default function HotOffersPage({ offers, cart, onAdd, onOpenOrders }: Props) {
  const topScore = offers[0]?.score ?? 0;
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <details className="rounded-xl border border-gray-800 bg-[#0d1220] px-5 py-3 text-sm text-gray-400">
        <summary className="cursor-pointer text-gray-300">Как считается приоритет?</summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p>
            Для каждой «горящей» партии ингредиента (срок годности меньше 3 суток) блюдо получает
            баллы: <span className="text-gray-200">срочность × покрытие × доля</span>. Баллы по
            всем ингредиентам блюда складываются.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-gray-200">Срочность</span> — чем меньше времени до конца срока,
              тем выше: через сутки вдвое меньше, чем «прямо сейчас».
            </li>
            <li>
              <span className="text-gray-200">Покрытие</span> — какую часть партии блюдо реально
              способно израсходовать: учитываются остаток партии, расход на порцию и сколько порций
              можно приготовить.
            </li>
            <li>
              <span className="text-gray-200">Доля</span> — если продукт нужен нескольким блюдам,
              баллы делятся между ними пропорционально расходу.
            </li>
          </ul>
          <p>Блюда из стоп-листа не рекомендуются. Список обновляется после каждого заказа и поставки.</p>
        </div>
      </details>

      {cartCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-5 py-3">
          <span className="text-sm text-emerald-300">В заказе порций: {cartCount}</span>
          <button
            onClick={onOpenOrders}
            className="text-sm text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
          >
            Перейти к оформлению →
          </button>
        </div>
      )}

      {offers.length === 0 ? (
        <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-6 text-emerald-300">
          Горячих предложений нет — срок годности продуктов не поджимает 🎉
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map((o, i) => (
            <HotOfferCard
              key={o.dish_id}
              offer={o}
              rank={i + 1}
              topScore={topScore}
              inCart={cart[o.dish_id] ?? 0}
              onAdd={() => onAdd(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
