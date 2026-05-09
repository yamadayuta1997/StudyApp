import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'notification_time';
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

export type NotificationTime = { hour: number; minute: number };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function saveNotificationTime(time: NotificationTime): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(time));
}

export async function loadNotificationTime(): Promise<NotificationTime> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  try {
    return JSON.parse(raw) as NotificationTime;
  } catch {
    return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  }
}

export async function scheduleReminderNotification(time: NotificationTime): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (Platform.OS === 'web') return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '学習リマインダー',
      body: '今日も勉強を始めましょう！',
      data: { screen: '/(tabs)/answer' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour: time.hour,
      minute: time.minute,
      repeats: true,
    },
  });
}

export async function cancelReminderNotification(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
