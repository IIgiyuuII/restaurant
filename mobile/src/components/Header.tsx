import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.panel, borderBottomColor: colors.border, borderBottomWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  title: { color: colors.strong, fontSize: 20, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 3 },
});