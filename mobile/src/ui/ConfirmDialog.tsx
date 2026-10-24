import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Button from './Button';
import Txt from './Txt';

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger, onConfirm, onCancel }: Props) {
  const { c } = useTheme();
  return (
    <Modal transparent visible={open} animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onCancel} />
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }} pointerEvents="box-none">
        <View style={{ backgroundColor: c.popover, borderRadius: 20, borderWidth: 1, borderColor: c.borderStrong, padding: 20 }}>
          <Txt w="semi" size={17} c="strong">{title}</Txt>
          {message ? <Txt size={14} c="muted" style={{ marginTop: 8 }}>{message}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Button label={cancelLabel} variant="outline" onPress={onCancel} style={{ flex: 1 }} />
            <Button label={confirmLabel} variant={danger ? 'danger' : 'primary'} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
