import { View } from 'react-native';
import type { Cart, HotOffer } from '../types';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../ui/Button';
import Collapsible from '../ui/Collapsible';
import ExpiryBadge from '../ui/Badge';
import Icon from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import Notice from '../ui/Notice';
import Panel from '../ui/Panel';
import ProgressBar from '../ui/ProgressBar';
import Screen from '../ui/Screen';
import Txt from '../ui/Txt';
import { PORTIONS, formatMoney, plural } from '../utils';

type Props = { offers: HotOffer[]; cart: Cart; onAdd: (o: HotOffer) => void; onOpenOrders: () => void };

const LEVELS: Record<HotOffer['level'], { label: string; icon: IconName; bar: string }> = {
  critical: { label: 'Срочно', icon: 'flame', bar: '#6366f1' },
  high: { label: 'Скоро', icon: 'clock', bar: '#f59e0b' },
  medium: { label: 'Желательно', icon: 'lightbulb', bar: '#10b981' },
};

export default function HotOffersScreen({ offers, cart, onAdd, onOpenOrders }: Props) {
  const { c } = useTheme();
  const topScore = offers[0]?.score ?? 0;
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <Screen gap={16}>
      <Collapsible title="Как считается приоритет?">
        <View style={{ gap: 8 }}>
          <Txt size={13} c="muted">Для каждой «горящей» партии (срок меньше 3 суток) блюдо получает баллы: срочность × покрытие × доля. Баллы по всем ингредиентам складываются.</Txt>
          <Txt size={13} c="muted">• Срочность — чем меньше времени до конца срока, тем выше.</Txt>
          <Txt size={13} c="muted">• Покрытие — какую часть партии блюдо реально способно израсходовать.</Txt>
          <Txt size={13} c="muted">• Доля — если продукт нужен нескольким блюдам, баллы делятся между ними.</Txt>
          <Txt size={13} c="muted">Блюда из стоп-листа не рекомендуются. Список обновляется после каждого заказа и поставки.</Txt>
        </View>
      </Collapsible>

      {cartCount > 0 && (
        <Panel tint={{ bg: c.accentSoft, border: c.accent + '55' }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
          <Txt w="medium" size={14} c="accentText">В заказе порций: {cartCount}</Txt>
          <Button label="К оформлению" size="sm" variant="soft" icon="arrowRight" onPress={onOpenOrders} />
        </Panel>
      )}

      {offers.length === 0 ? <Notice kind="success">Горячих предложений нет — срок годности продуктов не поджимает</Notice> : offers.map((o, i) => {
        const lvl = LEVELS[o.level];
        const inCart = cart[o.dish_id] ?? 0;
        return (
          <Panel key={o.dish_id} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Txt mono size={12} c="accentText">{String(i + 1)}</Txt>
              </View>
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="utensils" size={24} color={c.accentText} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Txt w="semi" size={16} c="strong">{o.name}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={lvl.icon} size={13} color={lvl.bar} />
                  <Txt w="medium" size={12} c={lvl.bar}>{lvl.label}</Txt>
                </View>
                <Txt size={12} c="muted">{formatMoney(o.price)} · доступно {o.portions} {plural(o.portions, PORTIONS)}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt size={10} c="muted">приоритет</Txt>
                <Txt w="bold" size={18} c="strong">{o.score.toFixed(2)}</Txt>
              </View>
            </View>
            <ProgressBar pct={topScore > 0 ? Math.max(6, (o.score / topScore) * 100) : 0} color={lvl.bar} />
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="lightbulb" size={14} color={c.tones.yellow.color} />
                <Txt w="medium" size={11} c="muted" upper tracking={0.6}>Почему рекомендуем</Txt>
              </View>
              {o.reasons.map((r) => (
                <View key={r.batch_id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Txt size={13} c="soft" style={{ flex: 1 }}>{r.text}</Txt>
                  <ExpiryBadge expiry={r.expires_at} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Button label="В заказ" icon="plus" onPress={() => onAdd(o)} disabled={inCart >= o.portions} style={{ flex: 1 }} />
              {inCart > 0 && <Txt w="medium" size={12} c="accentText">в заказе: {inCart}</Txt>}
            </View>
          </Panel>
        );
      })}
    </Screen>
  );
}
