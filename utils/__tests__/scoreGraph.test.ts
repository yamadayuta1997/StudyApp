import { getLastNScores, computeAverageScore, computeGraphPoints } from '../scoreGraph';
import type { CompareHistoryItem } from '../../app/(tabs)/history';

const makeItem = (id: string, score: number, date = '2026/1/1'): CompareHistoryItem => ({
  id,
  date,
  result: {
    score,
    passed: score >= 70,
    fatalErrors: 0,
    missingProcess: false,
    feedbacks: [],
    answerSteps: { issueRecognition: '', premise: '', logic: '', conclusion: '' },
    modelSteps: { issueRecognition: '', premise: '', logic: '', conclusion: '' },
  },
});

const items: CompareHistoryItem[] = [
  makeItem('1', 60),
  makeItem('2', 70),
  makeItem('3', 80),
  makeItem('4', 50),
  makeItem('5', 90),
  makeItem('6', 75),
  makeItem('7', 65),
  makeItem('8', 85),
  makeItem('9', 55),
  makeItem('10', 95),
  makeItem('11', 100),
];

describe('getLastNScores', () => {
  test('n=10 で末尾10件を返す', () => {
    const result = getLastNScores(items, 10);
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe('2');
    expect(result[9].id).toBe('11');
  });

  test('件数が n 未満の場合は全件返す', () => {
    const few = items.slice(0, 3);
    expect(getLastNScores(few, 10)).toHaveLength(3);
  });

  test('空配列を渡すと空配列を返す', () => {
    expect(getLastNScores([], 10)).toHaveLength(0);
  });

  test('元の配列を変更しない', () => {
    getLastNScores(items, 10);
    expect(items).toHaveLength(11);
  });
});

describe('computeAverageScore', () => {
  test('平均スコアを整数で返す', () => {
    const subset = [makeItem('a', 60), makeItem('b', 80)];
    expect(computeAverageScore(subset)).toBe(70);
  });

  test('小数点以下を四捨五入する', () => {
    const subset = [makeItem('a', 60), makeItem('b', 61)];
    expect(computeAverageScore(subset)).toBe(61);
  });

  test('空配列は null を返す', () => {
    expect(computeAverageScore([])).toBeNull();
  });

  test('1件のみの場合はそのスコアを返す', () => {
    expect(computeAverageScore([makeItem('a', 75)])).toBe(75);
  });
});

describe('computeGraphPoints', () => {
  const chartWidth = 200;
  const chartHeight = 80;
  const paddingLeft = 30;
  const paddingTop = 10;

  test('データ点の数がアイテム数と一致する', () => {
    const subset = [makeItem('a', 50), makeItem('b', 100)];
    const pts = computeGraphPoints(subset, chartWidth, chartHeight, paddingLeft, paddingTop);
    expect(pts).toHaveLength(2);
  });

  test('最初の点は左端、最後の点は右端', () => {
    const subset = [makeItem('a', 50), makeItem('b', 75), makeItem('c', 100)];
    const pts = computeGraphPoints(subset, chartWidth, chartHeight, paddingLeft, paddingTop);
    expect(pts[0].x).toBe(paddingLeft);
    expect(pts[pts.length - 1].x).toBe(paddingLeft + chartWidth);
  });

  test('スコアが最大値の点は y が最小（上端）', () => {
    const subset = [makeItem('a', 50), makeItem('b', 100)];
    const pts = computeGraphPoints(subset, chartWidth, chartHeight, paddingLeft, paddingTop);
    expect(pts[1].y).toBe(paddingTop);
  });

  test('スコアが最小値の点は y が最大（下端）', () => {
    const subset = [makeItem('a', 50), makeItem('b', 100)];
    const pts = computeGraphPoints(subset, chartWidth, chartHeight, paddingLeft, paddingTop);
    expect(pts[0].y).toBe(paddingTop + chartHeight);
  });

  test('全スコアが同じ場合にエラーにならない', () => {
    const subset = [makeItem('a', 70), makeItem('b', 70)];
    expect(() => computeGraphPoints(subset, chartWidth, chartHeight, paddingLeft, paddingTop)).not.toThrow();
  });

  test('空配列は空配列を返す', () => {
    expect(computeGraphPoints([], chartWidth, chartHeight, paddingLeft, paddingTop)).toHaveLength(0);
  });

  test('各点に score と date が含まれる', () => {
    const subset = [makeItem('a', 80, '2026/1/1')];
    const pts = computeGraphPoints(subset, chartWidth, chartHeight, paddingLeft, paddingTop);
    expect(pts[0].score).toBe(80);
    expect(pts[0].date).toBe('2026/1/1');
  });
});
