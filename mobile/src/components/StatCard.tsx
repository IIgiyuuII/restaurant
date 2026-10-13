import { StyleSheet, Text, View } from 'react-native';
import { Accent, accents, colors } from '../theme';

type Props = { label: string; value: string | number; hint?: string; accent?: Accent };

export default function StatCard({ label, value, hint, accent = 'gray' }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={[styles.value, { color: accents[accent] }]}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48.5%', backgroundColor: colors.panel, borderColor: colors.border,
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  label: { color: colors.muted, fontSize: 11, letterSpacing: 0.6 },
  value: { fontSize: 30, fontWeight: '600', marginTop: 6 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 4 },
});