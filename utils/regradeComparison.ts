export type DiffLine = {
  type: "same" | "added" | "removed";
  text: string;
};

export function extractScoreFromResult(result: string): number | null {
  const match = result.match(/(\d{1,3})\s*[\/／点点%]/);
  if (match) return parseInt(match[1], 10);
  return null;
}

export function buildLineDiff(prev: string, curr: string): DiffLine[] {
  const prevLines = prev.split("\n").filter(l => l.trim() !== "");
  const currLines = curr.split("\n").filter(l => l.trim() !== "");
  const prevSet = new Set(prevLines);
  const currSet = new Set(currLines);
  const diff: DiffLine[] = [];
  for (const line of prevLines) {
    if (!currSet.has(line)) diff.push({ type: "removed", text: line });
  }
  for (const line of currLines) {
    if (!prevSet.has(line)) diff.push({ type: "added", text: line });
    else diff.push({ type: "same", text: line });
  }
  return diff;
}

export function hasResultChanged(prev: string, curr: string): boolean {
  return prev.trim() !== curr.trim();
}

export function summarizeDiff(prev: string, curr: string): string {
  const prevScore = extractScoreFromResult(prev);
  const currScore = extractScoreFromResult(curr);
  if (prevScore !== null && currScore !== null) {
    if (currScore > prevScore) return `スコアが ${prevScore} → ${currScore} に上がりました`;
    if (currScore < prevScore) return `スコアが ${prevScore} → ${currScore} に下がりました`;
    return `スコアは変わりませんでした（${currScore}）`;
  }
  if (!hasResultChanged(prev, curr)) return "採点結果に変化はありませんでした";
  return "採点結果が更新されました";
}
