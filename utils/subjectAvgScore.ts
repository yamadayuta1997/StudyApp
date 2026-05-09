export type AvgScoreResult = { type: "none" } | { type: "avg"; value: number };

export function calcSubjectAvgScore(
  history: { subject: string; score: number | null }[],
  subject: string,
): AvgScoreResult {
  const scored = history.filter(h => h.subject === subject && h.score !== null);
  if (scored.length === 0) return { type: "none" };
  const avg = scored.reduce((sum, h) => sum + (h.score as number), 0) / scored.length;
  return { type: "avg", value: Math.round(avg) };
}
