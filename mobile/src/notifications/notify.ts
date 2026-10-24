import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AppEvent, Milestone, TabId } from './events';
import type { Category } from './prefs';

// Что делать с уведомлением, пришедшим, пока приложение открыто: показать баннер, как обычное.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const BRAND = '#6366f1';

/** Каналы Android: пользователь может отдельно настроить каждый тип в системных настройках. */
const CHANNELS: Record<Category, { name: string; importance: Notifications.AndroidImportance; description: string }> = {
  expiry: { name: 'Срок годности', importance: Notifications.AndroidImportance.HIGH, description: 'Партии, которые истекают или уже просрочены' },
  stoplist: { name: 'Стоп-лист', importance: Notifications.AndroidImportance.HIGH, description: 'Блюда, недоступные к заказу' },
  hot: { name: 'Горячие предложения', importance: Notifications.AndroidImportance.DEFAULT, description: 'Что срочно продать' },
  restock: { name: 'Закупка', importance: Notifications.AndroidImportance.DEFAULT, description: 'Закончившиеся продукты' },
  orders: { name: 'Отклонённые заказы', importance: Notifications.AndroidImportance.DEFAULT, description: 'Заказы, которые не прошли' },
};

export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    (Object.keys(CHANNELS) as Category[]).map((id) =>
      Notifications.setNotificationChannelAsync(id, {
        name: CHANNELS[id].name,
        description: CHANNELS[id].description,
        importance: CHANNELS[id].importance,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: BRAND,
      }),
    ),
  );
}

export type Permission = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<Permission> {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return s.status === 'undetermined' ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
}

export async function requestPermission(): Promise<Permission> {
  // На Android 13+ системный диалог появится только если уже создан хотя бы один канал.
  await ensureChannels();
  try {
    const s = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    return s.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

const channelTrigger = (category: Category) => (Platform.OS === 'android' ? { channelId: category } : null);

/** Показать уведомление прямо сейчас. */
export async function present(e: AppEvent): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: e.title, body: e.body, data: { tab: e.tab satisfies TabId, key: e.key }, color: BRAND, sound: 'default' },
    trigger: channelTrigger(e.category),
  });
}

/** Запланировать напоминание на точное время (сработает и при закрытом приложении). */
export async function schedule(m: Milestone): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: m.key,
    content: { title: m.title, body: m.body, data: { tab: 'writeoffs' satisfies TabId, key: m.key }, color: BRAND, sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(m.at),
      ...(Platform.OS === 'android' ? { channelId: 'expiry' } : null),
    },
  });
}

export async function scheduledIds(): Promise<string[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.map((r) => r.identifier);
}

export async function cancel(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

export async function clearDelivered(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}
