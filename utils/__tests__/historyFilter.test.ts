import {
  filterBySubject,
  filterByPassFail,
  sortByDate,
  applyFilters,
  PassFailFilter,
  SortOrder,
} from "../historyFilter";

type Item = { id: string; subject: string; score: number | null; date: string };

const make = (id: string, subject: string, score: number | null, date: string): Item => ({
  id,
  subject,
  score,
  date,
});

const items: Item[] = [
  make("1", "財務会計", 80, "2026/1/1"),
  make("2", "管理会計", 45, "2026/1/3"),
  make("3", "財務会計", 65, "2026/1/2"),
  make("4", "企業法", null, "2026/1/4"),
];

describe("filterBySubject", () => {
  test("null を渡すと全件返す", () => {
    expect(filterBySubject(items, null)).toHaveLength(4);
  });

  test("科目でフィルタリングできる", () => {
    const result = filterBySubject(items, "財務会計");
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.subject === "財務会計")).toBe(true);
  });

  test("一致する科目がなければ空配列", () => {
    expect(filterBySubject(items, "存在しない科目")).toHaveLength(0);
  });

  test("元の配列を変更しない", () => {
    filterBySubject(items, "財務会計");
    expect(items).toHaveLength(4);
  });
});

describe("filterByPassFail", () => {
  test('"all" で全件返す', () => {
    expect(filterByPassFail(items, "all")).toHaveLength(4);
  });

  test('"pass" でスコア70以上のみ返す', () => {
    const result = filterByPassFail(items, "pass");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  test('"fail" でスコア70未満のみ返す（nullは除外）', () => {
    const result = filterByPassFail(items, "fail");
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id).sort()).toEqual(["2", "3"]);
  });

  test("score が null のアイテムは pass/fail どちらでも除外", () => {
    const nullItem: Item[] = [make("x", "A", null, "2026/1/1")];
    expect(filterByPassFail(nullItem, "pass")).toHaveLength(0);
    expect(filterByPassFail(nullItem, "fail")).toHaveLength(0);
  });

  test("スコア70は合格", () => {
    const edge: Item[] = [make("e", "A", 70, "2026/1/1")];
    expect(filterByPassFail(edge, "pass")).toHaveLength(1);
    expect(filterByPassFail(edge, "fail")).toHaveLength(0);
  });
});

describe("sortByDate", () => {
  test('"newest" で新しい順', () => {
    const sorted = sortByDate(items, "newest");
    const ids = sorted.map((i) => i.id);
    expect(ids).toEqual(["4", "2", "3", "1"]);
  });

  test('"oldest" で古い順', () => {
    const sorted = sortByDate(items, "oldest");
    const ids = sorted.map((i) => i.id);
    expect(ids).toEqual(["1", "3", "2", "4"]);
  });

  test("元の配列を変更しない", () => {
    sortByDate(items, "newest");
    expect(items[0].id).toBe("1");
  });
});

describe("applyFilters", () => {
  test("科目フィルター + newest ソートが複合適用される", () => {
    const result = applyFilters(items, "財務会計", "all", "newest");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("3");
    expect(result[1].id).toBe("1");
  });

  test("合格フィルター + oldest ソート", () => {
    const result = applyFilters(items, null, "pass", "oldest");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  test("不合格フィルター + newest ソート", () => {
    const result = applyFilters(items, null, "fail", "newest");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("2");
    expect(result[1].id).toBe("3");
  });

  test("フィルター結果が0件の場合は空配列", () => {
    const result = applyFilters(items, "企業法", "pass", "newest");
    expect(result).toHaveLength(0);
  });
});
