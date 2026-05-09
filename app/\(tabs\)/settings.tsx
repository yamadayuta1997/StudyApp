import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import {
  cancelReminderNotification,
  loadNotificationTime,
  NotificationTime,
  requestNotificationPermission,
  saveNotificationTime,
  scheduleReminderNotification,
} from '@/utils/notifications';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState<NotificationTime>({ hour: 9, minute: 0 });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const saved = await loadNotificationTime();
        setTime(saved);
        const { status } = await Notifications.getPermissionsAsync();
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        setEnabled(status === 'granted' && scheduled.length > 0);
        setLoading(false);
      })();
    }, [])
  );

  const handleToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          '通知が許可されていません',
          '設定アプリから通知を許可してください。'
        );
        return;
      }
      await scheduleReminderNotification(time);
    } else {
      await cancelReminderNotification();
    }
    setEnabled(value);
  };

  const handleHourChange = async (hour: number) => {
    const next = { ...time, hour };
    setTime(next);
    await saveNotificationTime(next);
    if (enabled) await scheduleReminderNotification(next);
  };

  const handleMinuteChange = async (minute: number) => {
    const next = { ...time, minute };
    setTime(next);
    await saveNotificationTime(next);
    if (enabled) await scheduleReminderNotification(next);
  };

  if (loading) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <Text style={styles.title}>設定</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>学習リマインダー</Text>
        <View style={styles.row}>
          <Text style={styles.label}>通知を有効にする</Text>
          <Switch value={enabled} onValueChange={handleToggle} />
        </View>
      </View>

      {enabled && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>通知時刻</Text>

          <Text style={styles.subLabel}>時間</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
            {HOURS.map(h => (
              <TouchableOpacity
                key={h}
                style={[styles.chip, time.hour === h && styles.chipSelected]}
                onPress={() => handleHourChange(h)}
              >
                <Text style={[styles.chipText, time.hour === h && styles.chipTextSelected]}>
                  {String(h).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.subLabel}>分</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
            {MINUTES.map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, time.minute === m && styles.chipSelected]}
                onPress={() => handleMinuteChange(m)}
              >
                <Text style={[styles.chipText, time.minute === m && styles.chipTextSelected]}>
                  {String(m).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.timePreview}>
            設定時刻: {String(time.hour).padStart(2, '0')}:{String(time.minute).padStart(2, '0')}
          </Text>
        </View>
      )}

      {Platform.OS === 'web' && (
        <View style={styles.card}>
          <Text style={styles.webNote}>
            プッシュ通知はモバイルアプリでのみ利用できます。
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: '700', marginHorizontal: 16, marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15 },
  subLabel: { fontSize: 13, color: '#666', marginTop: 8, marginBottom: 4 },
  pickerRow: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 6,
    backgroundColor: '#f5f5f5',
  },
  chipSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { fontSize: 14, color: '#333' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  timePreview: { marginTop: 12, fontSize: 15, color: '#333', fontWeight: '500' },
  webNote: { fontSize: 14, color: '#666', textAlign: 'center' },
});
