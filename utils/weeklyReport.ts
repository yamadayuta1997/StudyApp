import AsyncStorage from "@react-native-async-storage/async-storage";

export type WeeklyHistoryItem = {
  subject: string;
  score: number | null;
  date: string;
  topics?: string[];
  wrongTopics?: string[];
};

export type WeeklyCompareItem = {
  date: string;
  score: number;
};

export type WeeklySummary = {
  scoringItems: WeeklyHistoryItem[];
  compareItems: WeeklyCompareItem[];
  totalCount: number;
  avgScore: number | null;
  subjectBreakdown: Record<string, { count: number; avgScore: number | null }>;
  topWrongTopics: { topic: string; count: number }[];
};

export type WeeklyReport = {
  achievements: string;
  improvements: string;
  suggestions: string;
};

export function isWithinLastDays(dateStr: string, days: number): boolean {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d >= cutoff;
}

export async function collectWeeklySummary(): Promise<WeeklySummary> {
  const [rawHistory, rawCompare] = await Promise.all([
    AsyncStorage.getItem("history"),
    AsyncStorage.getItem("compare_history"),
  ]);

  const history: any[] = rawHistory ? JSON.parse(rawHistory) : [];
  const compareHistory: any[] = rawCompare ? JSON.parse(rawCompare) : [];

  const scoringItems: WeeklyHistoryItem[] = history
    .filter((h) => isWithinLastDays(h.date, 7))
    .map((h) => ({
      subject: h.subject ?? "",
      score: h.score ?? null,
      date: h.date,
      topics: h.topics ?? [],
      wrongTopics: h.wrongTopics ?? [],
    }));

  const compareItems: WeeklyCompareItem[] = compareHistory
    .filter((c) => isWithinLastDays(c.date, 7) && c.result?.score !== undefined)
    .map((c) => ({
      date: c.date,
      score: c.result.score,
    }));

  const validScores = scoringItems.filter((h) => h.score !== null);
  const avgScore =
    validScores.length > 0
      ? Math.round(validScores.reduce((a, b) => a + (b.score ?? 0), 0) / validScores.length)
      : null;

  const subjectBreakdown: Record<string, { count: number; avgScore: number | null }> = {};
  scoringItems.forEach((h) => {
    if (!subjectBreakdown[h.subject]) {
      subjectBreakdown[h.subject] = { count: 0, avgScore: null };
    }
    subjectBreakdown[h.subject].count++;
  });
  Object.keys(subjectBreakdown).forEach((subj) => {
    const scores = scoringItems
      .filter((h) => h.subject === subj && h.score !== null)
      .map((h) => h.score as number);
    subjectBreakdown[subj].avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
  });

  const topicCounts: Record<string, number> = {};
  scoringItems.forEach((h) => {
    (h.wrongTopics ?? []).forEach((t) => {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
  });
  const topWrongTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  return {
    scoringItems,
    compareItems,
    totalCount: scoringItems.length + compareItems.length,
    avgScore,
    subjectBreakdown,
    topWrongTopics,
  };
}

export function isMonday(): boolean {
  return new Date().getDay() === 1;
}
