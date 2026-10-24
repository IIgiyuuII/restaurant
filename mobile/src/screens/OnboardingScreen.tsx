import { useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useTheme } from '../theme/ThemeProvider';
import Background from '../ui/Background';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import Txt from '../ui/Txt';

type Slide = { icon: IconName; title: string; text: string; points: [IconName, string][] };

const SLIDES: Slide[] = [
  {
    icon: 'sparkles',
    title: 'Добро пожаловать в FreshFlow',
    text: 'Учёт продуктов по партиям со сроками годности. Приложение само подскажет, что продавать первым и что пора докупить.',
    points: [],
  },
  {
    icon: 'box',
    title: 'Склад по партиям',
    text: 'Каждая поставка — отдельная партия со своим сроком. Продукты списываются по правилу FEFO: первым уходит то, что раньше испортится.',
    points: [['clock', 'Цветные метки срока годности'], ['box', 'Остатки и партии в реальном времени']],
  },
  {
    icon: 'flame',
    title: 'Стоп-лист и горячие предложения',
    text: 'Не хватает ингредиентов — блюдо автоматически попадает в стоп-лист. А блюда из продуктов с горящим сроком — в горячие предложения.',
    points: [['ban', 'Причина: чего именно не хватает'], ['flame', 'Что выгодно продать первым']],
  },
  {
    icon: 'receipt',
    title: 'Заказы, поставки, списание',
    text: 'Оформляйте заказы с автоматическим списанием ингредиентов, принимайте поставки и списывайте просрочку в пару касаний.',
    points: [['receipt', 'Заказ со списанием по FEFO'], ['truck', 'Рекомендации, что докупить'], ['trash', 'Аналитика потерь']],
  },
  {
    icon: 'bell',
    title: 'Не пропустите важное',
    text: 'Включите уведомления — телефон сам сообщит, когда нужно действовать, даже если приложение закрыто.',
    points: [
      ['clock', 'Срок годности партии истекает или вышел'],
      ['ban', 'Блюдо попало в стоп-лист'],
      ['box', 'Продукт закончился'],
      ['flame', 'Появилось срочное предложение'],
    ],
  },
];

/** Знакомство при первом запуске. Последний слайд предлагает включить уведомления. */
export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const notif = useNotifications();
  const scroll = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = index === SLIDES.length - 1;

  const go = (i: number) => scroll.current?.scrollTo({ x: i * width, animated: true });

  const enable = async () => {
    setBusy(true);
    try { await notif.requestAccess(); } finally { setBusy(false); }
    onDone();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page.base }}>
      <Background />
      <View style={{ height: insets.top + 8 }} />
      <View style={{ height: 40, paddingHorizontal: 20, alignItems: 'flex-end', justifyContent: 'center' }}>
        {!last && <Txt w="medium" size={14} c="muted" onPress={() => go(SLIDES.length - 1)} suppressHighlighting>Пропустить</Txt>}
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => (
          <ScrollView key={s.title} style={{ width }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={['#818cf8', '#4f46e5']} style={{ width: 104, height: 104, borderRadius: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 28 }}>
              <Icon name={s.icon} size={50} color="#fff" strokeWidth={1.6} />
            </LinearGradient>
            <Txt w="bold" size={26} c="strong" align="center" style={{ lineHeight: 32 }}>{s.title}</Txt>
            <Txt size={15} c="muted" align="center" style={{ marginTop: 12, lineHeight: 22 }}>{s.text}</Txt>
            {s.points.length > 0 && (
              <View style={{ marginTop: 24, gap: 10 }}>
                {s.points.map(([icon, label]) => (
                  <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={icon} size={18} color={c.accentText} />
                    </View>
                    <Txt size={14} c="body" style={{ flex: 1 }}>{label}</Txt>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={{ height: 8, width: i === index ? 24 : 8, borderRadius: 4, backgroundColor: i === index ? c.accent : c.borderStrong }} />
          ))}
        </View>
        {last ? (
          <View style={{ gap: 8 }}>
            <Button label="Включить уведомления" icon="bell" onPress={() => void enable()} loading={busy} full />
            <Button label="Не сейчас" variant="ghost" onPress={onDone} disabled={busy} full />
          </View>
        ) : (
          <Button label="Далее" icon="arrowRight" onPress={() => go(index + 1)} full />
        )}
      </View>
    </View>
  );
}
