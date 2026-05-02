export type WeakPoint = { type: string; count: number };

type FeedbackLike = { type: string };
type CompareItemLike = { result?: { feedbacks?: FeedbackLike[] } };
type RegularItemLike = { wrongTopics?: string[] };

export function computeWeakness(
  compareItems: CompareItemLike[],
  regularItems: RegularItemLike[],
  limit = 3,
): WeakPoint[] {
  const counts: Record<string, number> = {};

  for (const item of compareItems) {
    const feedbacks = item.result?.feedbacks;
    if (!Array.isArray(feedbacks)) continue;
    for (const fb of feedbacks) {
      if (typeof fb.type === 'string' && fb.type.length > 0) {
        counts[fb.type] = (counts[fb.type] || 0) + 1;
      }
    }
  }

  for (const item of regularItems) {
    if (!Array.isArray(item.wrongTopics)) continue;
    for (const topic of item.wrongTopics) {
      if (typeof topic === 'string' && topic.length > 0) {
        counts[topic] = (counts[topic] || 0) + 1;
      }
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type, count]) => ({ type, count }));
}
