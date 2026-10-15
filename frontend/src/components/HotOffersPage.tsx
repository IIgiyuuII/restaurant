import type { Cart, HotOffer } from '../types';
import HotOfferCard from './HotOfferCard';
import Collapsible from './Collapsible';
import Icon from './Icons';

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
    <div className="w-full min-w-0 space-y-6">
      <Collapsible title="Как считается приоритет?">
        <div className="space-y-2 leading-relaxed">
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
      </Collapsible>

      {cartCount > 0 && (
       <div className="animate-slide-down flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accent-soft px-4 sm:px-5 py-3">
          <span className="text-sm font-medium text-accent-text">В заказе порций: {cartCount}</span>
          <button
            onClick={onOpenOrders}
            className="inline-flex items-center gap-1 text-sm text-accent-text hover:opacity-80"
          >
            Перейти к оформлению
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      )}

      {offers.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-6 text-emerald-300">
          <Icon name="checkCircle" size={20} />
          Горячих предложений нет — срок годности продуктов не поджимает
        </div>
      ) : (
        
      <div className="stagger grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
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
