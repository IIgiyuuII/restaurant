import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Cart, HotOffer } from '../types';
import { colors } from '../theme';
import HotOfferCard from './HotOfferCard';

type Props = {
  offers: HotOffer[];
  cart: Cart;
  onAdd: (offer: HotOffer) => void;
  onOpenOrders: () => void;
};

export default function HotOffersPage({ offers, cart, onAdd, onOpenOrders }: Props) {
  const [help, setHelp] = useState(false);
  const topScore = offers[0]?.score ?? 0;
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <View>
      <View style={styles.help}>
        <Pressable onPress={() => setHelp((v) => !v)}>
          <Text style={styles.helpTitle}>{help ? '▾' : '▸'} Как считается приоритет?</Text>
        </Pressable>
        {help && (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Text style={styles.helpText}>
              Для каждой «горящей» партии ингредиента (срок годности меньше 3 суток) блюдо получает
              баллы: срочность × покрытие × доля. Баллы по всем ингредиентам блюда складываются.
            </Text>
            <Text style={styles.helpText}>
              • Срочность — чем меньше времени до конца срока, тем выше: через сутки вдвое меньше,
              чем «прямо сейчас.»
            </Text>
            <Text style={styles.helpText}>
              • Покрытие — какую часть партии блюдо реально способно израсходовать: учитываются
              остаток партии, расход на порцию и сколько порций можно приготовить.
            </Text>
            <Text style={styles.helpText}>
              • Доля — если продукт нужен нескольким блюдам, баллы делятся между ними
              пропорционально расходу.
            </Text>
            <Text style={styles.helpText}>
              Блюда из стоп-листа не рекомендуются. Список обновляется после каждого заказа и поставки.
            </Text>
          </View>
        )}
      </View>

      {cartCount > 0 && (
        <View style={styles.cartBar}>
          <Text style={{ color: '#6ee7b7', fontSize: 13 }}>В заказе порций: {cartCount}</Text>
          <Pressable onPress={onOpenOrders}>
            <Text style={styles.link}>Перейти к оформлению →</Text>
          </Pressable>
        </View>
      )}

      {offers.length === 0 ? (
        <View style={styles.none}>
          <Text style={{ color: '#6ee7b7' }}>
            Горячих предложений нет — срок годности продуктов не поджимает 🎉
          </Text>
        </View>
      ) : (
        offers.map((o, i) => (
          <HotOfferCard
            key={o.dish_id}
            offer={o}
            rank={i + 1}
            topScore={topScore}
            inCart={cart[o.dish_id] ?? 0}
            onAdd={() => onAdd(o)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  help: {
    backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1,
    borderRadius: 14, padding: 14, marginBottom: 12,
  },
  helpTitle: { color: '#d1d5db', fontSize: 14 },
  helpText: { color: colors.soft, fontSize: 13, lineHeight: 19 },
  cartBar: {
    borderColor: 'rgba(6,95,70,0.5)', borderWidth: 1, backgroundColor: 'rgba(2,44,34,0.2)',
    borderRadius: 14, padding: 14, marginBottom: 12, gap: 6,
  },
  link: { color: '#6ee7b7', fontSize: 14, textDecorationLine: 'underline' },
  none: {
    borderColor: 'rgba(6,95,70,0.4)', borderWidth: 1, backgroundColor: 'rgba(2,44,34,0.2)',
    borderRadius: 14, padding: 18,
  },
});