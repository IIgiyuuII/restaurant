import { View } from 'react-native';
import type { StopDish } from '../types';
import { useTheme } from '../theme/ThemeProvider';
import Notice from '../ui/Notice';
import Panel from '../ui/Panel';
import Screen from '../ui/Screen';
import Txt from '../ui/Txt';
import { formatDate } from '../utils';

export default function StopListScreen({ dishes }: { dishes: StopDish[] }) {
  const { c } = useTheme();
  return (
    <Screen gap={12}>
      {dishes.length === 0 ? <Notice kind="success">Стоп-лист пуст — все блюда доступны</Notice> : dishes.map((d) => (
        <Panel key={d.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Txt w="semi" size={16} c="strong" style={{ flex: 1 }}>{d.name}</Txt>
            {d.stopped_at ? <Txt size={12} c="muted">{formatDate(d.stopped_at)}</Txt> : null}
          </View>
          {d.category ? <Txt size={12} c="muted">{d.category}</Txt> : null}
          <View style={{ borderRadius: 10, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.inset, padding: 10 }}>
            <Txt size={12} c="soft" w="medium" style={{ lineHeight: 18 }}>{d.reason || 'Недостаточно доступных ингредиентов для приготовления.'}</Txt>
          </View>
        </Panel>
      ))}
    </Screen>
  );
}
