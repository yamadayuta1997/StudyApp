/** 1文字単位のJaccard類似度を返す（0〜1） */
export function jaccardSim(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const setA = new Set(a.replace(/\s+/g, '').split(''));
  const setB = new Set(b.replace(/\s+/g, '').split(''));
  let intersection = 0;
  setA.forEach((c) => { if (setB.has(c)) intersection++; });
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** answerText の長さに応じた閾値で類似と見なせるか判定する */
export function isCloseEnough(answerText: string, sim: number): boolean {
  const threshold = answerText.length <= 10 ? 0.15 : 0.25;
  return sim >= threshold;
}
