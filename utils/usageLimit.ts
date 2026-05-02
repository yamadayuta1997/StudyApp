import AsyncStorage from '@react-native-async-storage/async-storage';

// 開発者バイパス: true にすると制限なし
export const IS_DEV = false;

export const DAILY_LIMIT = 3;
const LIMIT_KEY = 'usage_limit';

type UsageData = { date: string; count: number };

function todayStr(): string {
  return new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }); // "YYYY/M/D"
}

async function readUsage(): Promise<UsageData> {
  try {
    const raw = await AsyncStorage.getItem(LIMIT_KEY);
    if (!raw) return { date: todayStr(), count: 0 };
    const data: UsageData = JSON.parse(raw);
    // 日付が変わっていたらリセット
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
  if (IS_DEV) return 0;
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
  if (IS_DEV) {
    console.log('[usageLimit] IS_DEV=true, bypass limit');
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
