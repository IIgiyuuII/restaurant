import { StyleSheet, Text, View } from 'react-native';
import { Tone, tones } from '../theme';

export default function Pill({ label, tone }: { label: string; tone: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 12 },
});