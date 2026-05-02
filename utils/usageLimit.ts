import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

// 開発者端末のベンダーID（初回起動時に Metro ログで確認して埋め込む）
// 未設定（空文字）の場合は IS_DEV フラグのみで制御
const DEV_VENDOR_ID = '04A99682-E1CE-4671-8E3E-0713C132B4C2';

export const DAILY_LIMIT = 3;
const LIMIT_KEY = 'usage_limit';

type UsageData = { date: string; count: number };

function todayStr(): string {
  return new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }); // "YYYY/M/D"
}

export async function getDeviceId(): Promise<string> {
  return getVendorId();
}

async function getVendorId(): Promise<string> {
  try {
    if (Platform.OS === 'ios') {
      const id = await Application.getIosIdForVendorAsync();
      return id ?? '';
    }
    // Android: applicationId を代用
    return Application.applicationId ?? '';
  } catch (e: any) {
    console.log('[usageLimit] getVendorId error:', e.message);
    return '';
  }
}

/** 開発者端末かどうかを確認する */
export async function isDevDevice(): Promise<boolean> {
  const id = await getVendorId();
  // 未設定の場合は非DEV扱い
  if (!DEV_VENDOR_ID) return false;
  const result = id === DEV_VENDOR_ID;
  console.log('[usageLimit] vendorId:', id, 'isDev:', result);
  return result;
}

/** 初回起動時に Metro ログでデバイス ID を確認するためのヘルパー */
export async function logDeviceId(): Promise<void> {
  const id = await getVendorId();
  console.log('[usageLimit] ===== DEVICE ID =====');
  console.log('[usageLimit] vendorId:', id);
  console.log('[usageLimit] DEV_VENDOR_ID に上記の値をコピーしてください');
  console.log('[usageLimit] ====================');
}

async function readUsage(): Promise<UsageData> {
  try {
    const raw = await AsyncStorage.getItem(LIMIT_KEY);
    if (!raw) return { date: todayStr(), count: 0 };
    const data: UsageData = JSON.parse(raw);
    if (data.date !== todayStr()) {
      console.log('[usageLimit] date changed, reset count:', data.date, '->', todayStr());
      return { date: todayStr(), count: 0 };
    }
    return data;
  } catch (e: any) {
    console.log('[usageLimit] readUsage error:', e.message);
    return { date: todayStr(), count: 0 };
  }
}

/** 現在の使用回数を返す（increment なし） */
export async function getUsageCount(): Promise<number> {
  if (await isDevDevice()) return 0;
  const data = await readUsage();
  console.log('[usageLimit] getUsageCount:', data.count, '/', DAILY_LIMIT);
  return data.count;
}

/** 使用可能か確認してカウントを増やす */
export async function checkAndIncrement(): Promise<{
  allowed: boolean;
  count: number;
  remaining: number;
}> {
  if (await isDevDevice()) {
    console.log('[usageLimit] dev device, bypass limit');
    return { allowed: true, count: 0, remaining: DAILY_LIMIT };
  }

  const data = await readUsage();
  console.log('[usageLimit] before increment: count=', data.count, 'date=', data.date);

  if (data.count >= DAILY_LIMIT) {
    console.log('[usageLimit] BLOCKED count=', data.count, '>= limit=', DAILY_LIMIT);
    return { allowed: false, count: data.count, remaining: 0 };
  }

  data.count += 1;
  try {
    await AsyncStorage.setItem(LIMIT_KEY, JSON.stringify(data));
  } catch (e: any) {
    console.log('[usageLimit] write error:', e.message);
  }

  const remaining = DAILY_LIMIT - data.count;
  console.log('[usageLimit] allowed count=', data.count, 'remaining=', remaining);
  return { allowed: true, count: data.count, remaining };
}
