import {
  extractScoreFromResult,
  buildLineDiff,
  hasResultChanged,
  summarizeDiff,
} from "../regradeComparison";

describe("extractScoreFromResult", () => {
  test("得点表記から数値を抽出できる", () => {
    expect(extractScoreFromResult("合計 80/100 点")).toBe(80);
  });
  test("パーセント表記から数値を抽出できる", () => {
    expect(extractScoreFromResult("スコア: 75%")).toBe(75);
  });
  test("スコアが含まれない場合は null を返す", () => {
    expect(extractScoreFromResult("特に点数なし")).toBeNull();
  });
  test("複数の数値がある場合は最初にマッチしたものを返す", () => {
    expect(extractScoreFromResult("問1: 20/25 問2: 30/35")).toBe(20);
  });
});

describe("hasResultChanged", () => {
  test("同じ内容は変化なしと判定する", () => {
    expect(hasResultChanged("結果A", "結果A")).toBe(false);
  });
  test("異なる内容は変化ありと判定する", () => {
    expect(hasResultChanged("結果A", "結果B")).toBe(true);
  });
  test("前後の空白を無視して比較する", () => {
    expect(hasResultChanged("  結果A  ", "結果A")).toBe(false);
  });
});

describe("buildLineDiff", () => {
  test("追加行は added になる", () => {
    const diff = buildLineDiff("行1", "行1\n行2");
    const added = diff.filter(d => d.type === "added");
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe("行2");
  });
  test("削除行は removed になる", () => {
    const diff = buildLineDiff("行1\n行2", "行1");
    const removed = diff.filter(d => d.type === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0].text).toBe("行2");
  });
  test("同じ行は same になる", () => {
    const diff = buildLineDiff("行1", "行1");
    expect(diff.filter(d => d.type === "same")).toHaveLength(1);
  });
  test("空行はフィルタリングされる", () => {
    const diff = buildLineDiff("行1\n\n行2", "行1\n行2");
    const nonEmpty = diff.filter(d => d.text.trim() !== "");
    expect(nonEmpty.every(d => d.type === "same")).toBe(true);
  });
});

describe("summarizeDiff", () => {
  test("スコアが上がった場合にメッセージが返る", () => {
    const msg = summarizeDiff("合計 60/100 点", "合計 80/100 点");
    expect(msg).toContain("上がりました");
    expect(msg).toContain("60");
    expect(msg).toContain("80");
  });
  test("スコアが下がった場合にメッセージが返る", () => {
    const msg = summarizeDiff("合計 80/100 点", "合計 60/100 点");
    expect(msg).toContain("下がりました");
  });
  test("スコアが同じ場合にメッセージが返る", () => {
    const msg = summarizeDiff("合計 70/100 点", "合計 70/100 点");
    expect(msg).toContain("変わりませんでした");
  });
  test("スコアが読み取れない場合でも変化有無のメッセージが返る", () => {
    const msg = summarizeDiff("結果A", "結果B");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
  test("内容が変わらない場合は変化なしのメッセージが返る", () => {
    const msg = summarizeDiff("結果A", "結果A");
    expect(msg).toContain("変化はありませんでした");
  });
});
