import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  cancelReminderNotification,
  loadNotificationTime,
  requestNotificationPermission,
  saveNotificationTime,
  scheduleReminderNotification,
} from '../notifications';

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestNotificationPermission', () => {
  test('returns true when already granted', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('requests permission when not granted and returns true on grant', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  test('returns false when permission denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
  });
});

describe('saveNotificationTime / loadNotificationTime', () => {
  test('saves time to AsyncStorage', async () => {
    mockStorage.setItem.mockResolvedValue(undefined);
    await saveNotificationTime({ hour: 8, minute: 30 });
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'notification_time',
      JSON.stringify({ hour: 8, minute: 30 })
    );
  });

  test('loads saved time', async () => {
    mockStorage.getItem.mockResolvedValue(JSON.stringify({ hour: 8, minute: 30 }));
    const time = await loadNotificationTime();
    expect(time).toEqual({ hour: 8, minute: 30 });
  });

  test('returns default time when nothing saved', async () => {
    mockStorage.getItem.mockResolvedValue(null);
    const time = await loadNotificationTime();
    expect(time).toEqual({ hour: 9, minute: 0 });
  });

  test('returns default time when stored value is corrupt', async () => {
    mockStorage.getItem.mockResolvedValue('not-json');
    const time = await loadNotificationTime();
    expect(time).toEqual({ hour: 9, minute: 0 });
  });
});

describe('scheduleReminderNotification', () => {
  test('cancels existing notifications before scheduling', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.cancelAllScheduledNotificationsAsync.mockResolvedValue();
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('id');
    await scheduleReminderNotification({ hour: 9, minute: 0 });
    expect(mockNotifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });

  test('schedules repeating calendar notification with correct time', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.cancelAllScheduledNotificationsAsync.mockResolvedValue();
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('id');
    await scheduleReminderNotification({ hour: 7, minute: 30 });
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ hour: 7, minute: 30, repeats: true }),
      })
    );
  });

  test('does not schedule when permission denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    mockNotifications.cancelAllScheduledNotificationsAsync.mockResolvedValue();
    await scheduleReminderNotification({ hour: 9, minute: 0 });
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('notification content includes screen route in data', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.cancelAllScheduledNotificationsAsync.mockResolvedValue();
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('id');
    await scheduleReminderNotification({ hour: 9, minute: 0 });
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: expect.objectContaining({ screen: '/(tabs)/answer' }),
        }),
      })
    );
  });
});

describe('cancelReminderNotification', () => {
  test('cancels all scheduled notifications', async () => {
    mockNotifications.cancelAllScheduledNotificationsAsync.mockResolvedValue();
    await cancelReminderNotification();
    expect(mockNotifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });
});
