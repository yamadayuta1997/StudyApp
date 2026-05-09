import { collectWeeklySummary, isMonday, isWithinLastDays } from "../weeklyReport";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGetItem = AsyncStorage.getItem as jest.Mock;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("ja-JP");
}

const makeHistoryItem = (
  subject: string,
  score: number | null,
  daysBack: number,
  wrongTopics: string[] = []
) => ({
  id: Math.random().toString(),
  subject,
  score,
  date: daysAgo(daysBack),
  topics: [],
  wrongTopics,
});

describe("isWithinLastDays", () => {
  it("当日はtrue", () => {
    expect(isWithinLastDays(new Date().toLocaleDateString("ja-JP"), 7)).toBe(true);
  });

  it("6日前はtrue", () => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    expect(isWithinLastDays(d.toLocaleDateString("ja-JP"), 7)).toBe(true);
  });

  it("8日前はfalse", () => {
    const d = new Date();
    d.setDate(d.getDate() - 8);
    expect(isWithinLastDays(d.toLocaleDateString("ja-JP"), 7)).toBe(false);
  });

  it("無効な日付はfalse", () => {
    expect(isWithinLastDays("invalid-date", 7)).toBe(false);
  });
});

describe("collectWeeklySummary", () => {
  beforeEach(() => {
    mockGetItem.mockReset();
  });

  it("過去7日以内の採点のみ含まれる", async () => {
    const inside = makeHistoryItem("財務会計論", 80, 3);
    const outside = makeHistoryItem("財務会計論", 70, 8);
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify([inside, outside]))
      .mockResolvedValueOnce(null);

    const summary = await collectWeeklySummary();
    expect(summary.scoringItems).toHaveLength(1);
    expect(summary.scoringItems[0].subject).toBe("財務会計論");
  });

  it("採点なしのとき totalCount は0", async () => {
    mockGetItem.mockResolvedValue(null);
    const summary = await collectWeeklySummary();
    expect(summary.totalCount).toBe(0);
    expect(summary.avgScore).toBeNull();
  });

  it("avgScore が正しく計算される", async () => {
    const items = [
      makeHistoryItem("財務会計論", 80, 1),
      makeHistoryItem("管理会計論", 60, 2),
    ];
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify(items))
      .mockResolvedValueOnce(null);
    const summary = await collectWeeklySummary();
    expect(summary.avgScore).toBe(70);
  });

  it("topWrongTopics が頻度順に返る", async () => {
    const items = [
      makeHistoryItem("財務会計論", 70, 1, ["収益認識", "リース"]),
      makeHistoryItem("財務会計論", 60, 2, ["収益認識"]),
    ];
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify(items))
      .mockResolvedValueOnce(null);
    const summary = await collectWeeklySummary();
    expect(summary.topWrongTopics[0].topic).toBe("収益認識");
    expect(summary.topWrongTopics[0].count).toBe(2);
  });

  it("subjectBreakdown が科目ごとに集計される", async () => {
    const items = [
      makeHistoryItem("財務会計論", 80, 1),
      makeHistoryItem("財務会計論", 60, 2),
      makeHistoryItem("監査論", 70, 3),
    ];
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify(items))
      .mockResolvedValueOnce(null);
    const summary = await collectWeeklySummary();
    expect(summary.subjectBreakdown["財務会計論"].count).toBe(2);
    expect(summary.subjectBreakdown["財務会計論"].avgScore).toBe(70);
    expect(summary.subjectBreakdown["監査論"].count).toBe(1);
  });

  it("スコアがnullの項目はavgScore計算から除外される", async () => {
    const items = [
      makeHistoryItem("財務会計論", null, 1),
      makeHistoryItem("管理会計論", 80, 2),
    ];
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify(items))
      .mockResolvedValueOnce(null);
    const summary = await collectWeeklySummary();
    expect(summary.avgScore).toBe(80);
  });

  it("比較採点も totalCount に含まれる", async () => {
    const compareItems = [
      { id: "c1", date: daysAgo(1), result: { score: 75 } },
    ];
    mockGetItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(compareItems));
    const summary = await collectWeeklySummary();
    expect(summary.compareItems).toHaveLength(1);
    expect(summary.totalCount).toBe(1);
  });

  it("topWrongTopics は最大5件", async () => {
    const items = [
      makeHistoryItem("財務会計論", 50, 1, ["A", "B", "C", "D", "E", "F"]),
    ];
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify(items))
      .mockResolvedValueOnce(null);
    const summary = await collectWeeklySummary();
    expect(summary.topWrongTopics.length).toBeLessThanOrEqual(5);
  });
});

describe("isMonday", () => {
  it("月曜日かどうかを正しく判定する", () => {
    const result = isMonday();
    expect(result).toBe(new Date().getDay() === 1);
  });
});
