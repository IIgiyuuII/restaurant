import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type TabId = 'dashboard' | 'stock' | 'stoplist' | 'hot' | 'orders';

const items: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'stock', label: 'Остатки', icon: '📦' },
  { id: 'stoplist', label: 'Стоп-лист', icon: '🚫' },
  { id: 'hot', label: 'Горячие', icon: '🔥' },
  { id: 'orders', label: 'Заказы', icon: '🧾' },
];

export default function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <View style={styles.bar}>
      {items.map((it) => {
        const on = active === it.id;
        return (
          <Pressable key={it.id} style={styles.item} onPress={() => onChange(it.id)}>
            <Text style={styles.icon}>{it.icon}</Text>
            <Text style={[styles.label, on && styles.labelOn]}>{it.label}</Text>
            {on && <View style={styles.dot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: colors.panel,
    borderTopColor: colors.border, borderTopWidth: 1,
  },
  item: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  icon: { fontSize: 20 },
  label: { color: colors.muted, fontSize: 11, marginTop: 2 },
  labelOn: { color: colors.emerald, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.emerald, marginTop: 3 },
});