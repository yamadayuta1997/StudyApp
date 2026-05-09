import { computeStreak, generateTasksFromWorkbooks, getRemainingDays, Workbook } from "../calendarUtils";

const BASE = new Date("2026-01-01T00:00:00");
const EXAM_31 = "2026-02-01"; // 31 days from BASE

const wb1: Workbook = { id: "w1", name: "テキストA", subject: "財務会計論", pages: 100, rounds: 2, order: 1 };
const wb2: Workbook = { id: "w2", name: "テキストB", subject: "管理会計論", pages: 50, rounds: 1, order: 2 };

describe("getRemainingDays", () => {
  test("returns positive days when exam is in the future", () => {
    expect(getRemainingDays(EXAM_31, BASE)).toBe(31);
  });

  test("returns 0 when exam is today", () => {
    expect(getRemainingDays("2026-01-01", BASE)).toBe(0);
  });

  test("returns negative when exam has passed", () => {
    expect(getRemainingDays("2025-12-31", BASE)).toBeLessThan(0);
  });

  test("returns null for empty string", () => {
    expect(getRemainingDays("", BASE)).toBeNull();
  });
});

describe("generateTasksFromWorkbooks", () => {
  test("returns empty array for no workbooks", () => {
    expect(generateTasksFromWorkbooks(EXAM_31, [], BASE)).toEqual([]);
  });

  test("returns empty array when exam date is past", () => {
    expect(generateTasksFromWorkbooks("2025-12-31", [wb1], BASE)).toEqual([]);
  });

  test("returns empty array when exam date is today", () => {
    expect(generateTasksFromWorkbooks("2026-01-01", [wb1], BASE)).toEqual([]);
  });

  test("covers all pages across tasks (single book, 1 round)", () => {
    const wb: Workbook = { id: "w1", name: "A", subject: "S", pages: 60, rounds: 1, order: 1 };
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb], BASE);
    const total = tasks.reduce((s, t) => s + (t.endPage - t.startPage + 1), 0);
    expect(total).toBe(60);
  });

  test("covers total pages for multiple books and rounds", () => {
    // total = 100*2 + 50*1 = 250
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb1, wb2], BASE);
    const total = tasks.reduce((s, t) => s + (t.endPage - t.startPage + 1), 0);
    expect(total).toBe(250);
  });

  test("processes workbooks in order field, not insertion order", () => {
    // Pass wb2 (order=2) first, but wb1 (order=1) should appear first in tasks
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb2, wb1], BASE);
    expect(tasks[0].workbookId).toBe("w1");
    const lastWb2 = [...tasks].reverse().find(t => t.workbookId === "w2");
    const lastWb1 = [...tasks].reverse().find(t => t.workbookId === "w1");
    expect(lastWb1!.date <= lastWb2!.date).toBe(true);
  });

  test("round 1 of a workbook completes before round 2", () => {
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb1], BASE);
    const r1 = tasks.filter(t => t.round === 1);
    const r2 = tasks.filter(t => t.round === 2);
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
    expect(r1[r1.length - 1].date <= r2[0].date).toBe(true);
  });

  test("page ranges within a round are contiguous and non-overlapping", () => {
    const wb: Workbook = { id: "w1", name: "A", subject: "S", pages: 50, rounds: 1, order: 1 };
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb], BASE);
    let expected = 1;
    for (const t of tasks) {
      expect(t.startPage).toBe(expected);
      expected = t.endPage + 1;
    }
    expect(expected - 1).toBe(50);
  });

  test("first task startPage is 1 for each workbook/round segment", () => {
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb1], BASE);
    const r1First = tasks.find(t => t.round === 1);
    const r2First = tasks.find(t => t.round === 2);
    expect(r1First?.startPage).toBe(1);
    expect(r2First?.startPage).toBe(1);
  });

  test("task id is unique", () => {
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb1, wb2], BASE);
    const ids = tasks.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("all tasks have dates between fromDate and examDate", () => {
    const tasks = generateTasksFromWorkbooks(EXAM_31, [wb1], BASE);
    for (const t of tasks) {
      expect(t.date >= "2026-01-01").toBe(true);
      expect(t.date < EXAM_31).toBe(true);
    }
  });
});

describe("computeStreak", () => {
  const TODAY = new Date("2026-05-09T00:00:00");

  test("returns zero streaks for empty history", () => {
    const result = computeStreak([], TODAY);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.studiedDates.size).toBe(0);
  });

  test("handles ISO date format (YYYY-MM-DD)", () => {
    const result = computeStreak(["2026-05-09"], TODAY);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.studiedDates.has("2026-05-09")).toBe(true);
  });

  test("handles ja-JP locale date format (YYYY/M/D)", () => {
    const result = computeStreak(["2026/5/9"], TODAY);
    expect(result.currentStreak).toBe(1);
    expect(result.studiedDates.has("2026-05-09")).toBe(true);
  });

  test("currentStreak counts consecutive days ending today", () => {
    const dates = ["2026/5/7", "2026/5/8", "2026/5/9"];
    const result = computeStreak(dates, TODAY);
    expect(result.currentStreak).toBe(3);
  });

  test("currentStreak counts consecutive days ending yesterday", () => {
    const dates = ["2026/5/6", "2026/5/7", "2026/5/8"];
    const result = computeStreak(dates, TODAY);
    expect(result.currentStreak).toBe(3);
  });

  test("currentStreak is 0 when last activity was 2+ days ago", () => {
    const dates = ["2026/5/6", "2026/5/7"];
    const result = computeStreak(dates, TODAY);
    expect(result.currentStreak).toBe(0);
  });

  test("longestStreak is computed correctly across gap", () => {
    // 3-day run, gap, 2-day run
    const dates = ["2026/5/1", "2026/5/2", "2026/5/3", "2026/5/5", "2026/5/6"];
    const result = computeStreak(dates, TODAY);
    expect(result.longestStreak).toBe(3);
  });

  test("duplicate dates are deduplicated", () => {
    const dates = ["2026/5/9", "2026/5/9", "2026/5/8"];
    const result = computeStreak(dates, TODAY);
    expect(result.currentStreak).toBe(2);
    expect(result.studiedDates.size).toBe(2);
  });

  test("longestStreak equals currentStreak for single continuous block ending today", () => {
    const dates = ["2026/5/7", "2026/5/8", "2026/5/9"];
    const result = computeStreak(dates, TODAY);
    expect(result.longestStreak).toBe(result.currentStreak);
  });

  test("studiedDates contains all unique normalized dates", () => {
    const dates = ["2026/5/1", "2026/5/2", "2026-05-03"];
    const result = computeStreak(dates, TODAY);
    expect(result.studiedDates.has("2026-05-01")).toBe(true);
    expect(result.studiedDates.has("2026-05-02")).toBe(true);
    expect(result.studiedDates.has("2026-05-03")).toBe(true);
  });
});
