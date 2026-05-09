import { buildHistoryCsv } from "../exportCsv";
import { HistoryItem } from "@/app/(tabs)/explore";

const baseItem: HistoryItem = {
  id: "1",
  subject: "財務会計論",
  question: "問題文",
  answer: "回答",
  result: "正解",
  score: 80,
  date: "2026-05-09T10:00:00.000Z",
  topics: ["収益認識", "リース"],
  wrongTopics: [],
};

describe("buildHistoryCsv", () => {
  it("ヘッダー行が正しく含まれる", () => {
    const csv = buildHistoryCsv([baseItem]);
    expect(csv.split("\n")[0]).toBe("日付,科目,得点,合否,論点,誤答論点");
  });

  it("日付がYYYY-MM-DD形式に変換される", () => {
    const csv = buildHistoryCsv([baseItem]);
    expect(csv).toContain("2026-05-09");
  });

  it("得点60以上は合格と判定される", () => {
    const csv = buildHistoryCsv([baseItem]);
    expect(csv).toContain("合格");
  });

  it("得点60未満は不合格と判定される", () => {
    const item: HistoryItem = { ...baseItem, score: 50 };
    const csv = buildHistoryCsv([item]);
    expect(csv).toContain("不合格");
  });

  it("得点がnullの場合は空欄になる", () => {
    const item: HistoryItem = { ...baseItem, score: null };
    const csv = buildHistoryCsv([item]);
    const row = csv.split("\n")[1];
    const cols = row.split(",");
    expect(cols[2]).toBe("");
    expect(cols[3]).toBe("");
  });

  it("論点が中点区切りで結合される", () => {
    const csv = buildHistoryCsv([baseItem]);
    expect(csv).toContain("収益認識・リース");
  });

  it("誤答論点が含まれる", () => {
    const item: HistoryItem = { ...baseItem, wrongTopics: ["減価償却"] };
    const csv = buildHistoryCsv([item]);
    expect(csv).toContain("減価償却");
  });

  it("ダブルクォート内のダブルクォートはエスケープされる", () => {
    const item: HistoryItem = { ...baseItem, subject: '財務"会計論' };
    const csv = buildHistoryCsv([item]);
    expect(csv).toContain('"財務""会計論"');
  });

  it("履歴が空のとき1行のみ（ヘッダーのみ）", () => {
    const csv = buildHistoryCsv([]);
    expect(csv.split("\n")).toHaveLength(1);
  });

  it("複数行が正しく出力される", () => {
    const item2: HistoryItem = { ...baseItem, id: "2", subject: "監査論", score: 55, date: "2026-05-08T09:00:00.000Z" };
    const csv = buildHistoryCsv([baseItem, item2]);
    expect(csv.split("\n")).toHaveLength(3);
  });
});
