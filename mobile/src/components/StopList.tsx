import { StyleSheet, Text, View } from 'react-native';
import type { StopDish } from '../types';
import { colors } from '../theme';
import { plural } from '../utils';

export default function StopList({ dishes }: { dishes: StopDish[] }) {
  if (dishes.length === 0) {
    return (
      <View style={styles.ok}>
        <Text style={{ color: '#6ee7b7' }}>Стоп-лист пуст — все блюда доступны 🎉</Text>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Text style={styles.count}>
        {dishes.length} {plural(dishes.length, ['блюдо', 'блюда', 'блюд'])} недоступно
      </Text>
      {dishes.map((d) => (
        <View key={d.id} style={styles.row}>
          <View style={styles.dot} />
          <Text style={styles.name}>{d.name}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ok: {
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(6,95,70,0.5)',
    backgroundColor: 'rgba(2,44,34,0.3)', padding: 18,
  },
  box: {
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(127,29,29,0.4)',
    backgroundColor: 'rgba(69,10,10,0.15)', padding: 14,
  },
  count: { color: colors.red, fontSize: 14, marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
    backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  name: { color: colors.text, fontSize: 15 },
});