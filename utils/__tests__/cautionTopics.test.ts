jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOverdueReviewTopics } from '../cautionTopics';

const mockGetItem = AsyncStorage.getItem as jest.Mock;

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => jest.clearAllMocks());

describe('getOverdueReviewTopics', () => {
  test('3日以上前のisCautionトピックを返す', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({
      '財務会計論::収益認識': { streak: 3, isCaution: true, lastReviewed: daysAgoStr(4) },
    }));
    const result = await getOverdueReviewTopics();
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe('収益認識');
    expect(result[0].subject).toBe('財務会計論');
    expect(result[0].daysSinceReview).toBe(4);
  });

  test('2日前のisCautionトピックは返さない', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({
      '財務会計論::収益認識': { streak: 3, isCaution: true, lastReviewed: daysAgoStr(2) },
    }));
    const result = await getOverdueReviewTopics();
    expect(result).toHaveLength(0);
  });

  test('isCautionでないトピックは返さない', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({
      '財務会計論::収益認識': { streak: 2, isCaution: false, lastReviewed: daysAgoStr(5) },
    }));
    const result = await getOverdueReviewTopics();
    expect(result).toHaveLength(0);
  });

  test('lastReviewedが未設定の場合はoverdueとして扱う', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({
      '監査論::独立性': { streak: 3, isCaution: true },
    }));
    const result = await getOverdueReviewTopics();
    expect(result).toHaveLength(1);
    expect(result[0].daysSinceReview).toBeNull();
  });

  test('daysSinceReviewの降順でソートされる', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({
      '財務会計論::収益認識': { streak: 3, isCaution: true, lastReviewed: daysAgoStr(4) },
      '監査論::独立性': { streak: 4, isCaution: true, lastReviewed: daysAgoStr(7) },
    }));
    const result = await getOverdueReviewTopics();
    expect(result[0].topic).toBe('独立性');
    expect(result[1].topic).toBe('収益認識');
  });

  test('lastReviewed未設定のトピックは末尾ではなく先頭にくる（daysSinceReview=nullは999扱い）', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({
      '財務会計論::収益認識': { streak: 3, isCaution: true, lastReviewed: daysAgoStr(5) },
      '監査論::独立性': { streak: 4, isCaution: true },
    }));
    const result = await getOverdueReviewTopics();
    expect(result[0].topic).toBe('独立性');
  });

  test('ストレージが空の場合は空配列を返す', async () => {
    mockGetItem.mockResolvedValue(null);
    const result = await getOverdueReviewTopics();
    expect(result).toHaveLength(0);
  });

  test('daysThreshold引数で閾値を変更できる', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({
      '財務会計論::収益認識': { streak: 3, isCaution: true, lastReviewed: daysAgoStr(2) },
    }));
    const result = await getOverdueReviewTopics(1);
    expect(result).toHaveLength(1);
  });
});
