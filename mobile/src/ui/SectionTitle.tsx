import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Icon from './Icon';
import type { IconName } from './Icon';
import Txt from './Txt';

type Props = { icon?: IconName; children: string; action?: { label: string; onPress: () => void } };

export default function SectionTitle({ icon, children, action }: Props) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        {icon && <Icon name={icon} size={20} color={c.accentText} />}
        <Txt w="semi" size={16} c="strong" style={{ flexShrink: 1 }}>{children}</Txt>
      </View>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt w="medium" size={13} c="accentText">{action.label}</Txt>
          <Icon name="arrowRight" size={14} color={c.accentText} />
        </Pressable>
      )}
    </View>
  );
}
