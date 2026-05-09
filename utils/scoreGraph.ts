import type { CompareHistoryItem } from '../app/(tabs)/history';

export type GraphPoint = { x: number; y: number; score: number; date: string };

export function getLastNScores(items: CompareHistoryItem[], n = 10): CompareHistoryItem[] {
  return items.slice(-n);
}

export function computeAverageScore(items: CompareHistoryItem[]): number | null {
  if (items.length === 0) return null;
  const sum = items.reduce((acc, item) => acc + item.result.score, 0);
  return Math.round(sum / items.length);
}

export function computeGraphPoints(
  items: CompareHistoryItem[],
  chartWidth: number,
  chartHeight: number,
  paddingLeft: number,
  paddingTop: number
): GraphPoint[] {
  if (items.length === 0) return [];

  const scores = items.map((item) => item.result.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  return items.map((item, i) => ({
    x: paddingLeft + (i / Math.max(items.length - 1, 1)) * chartWidth,
    y: paddingTop + chartHeight - ((item.result.score - min) / range) * chartHeight,
    score: item.result.score,
    date: item.date,
  }));
}
