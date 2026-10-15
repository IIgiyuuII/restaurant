import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

export default function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.t}>{children.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  t: { color: colors.muted, fontSize: 12, letterSpacing: 0.8, marginBottom: 10 },
});