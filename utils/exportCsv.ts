import { HistoryItem } from "@/app/(tabs)/explore";

export function buildHistoryCsv(history: HistoryItem[]): string {
  const header = "日付,科目,得点,合否,論点,誤答論点";
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = history.map(item => {
    const date = item.date ? item.date.split("T")[0] : "";
    const subject = item.subject ?? "";
    const score = item.score !== null && item.score !== undefined ? String(item.score) : "";
    const pass = item.score !== null && item.score !== undefined ? (item.score >= 60 ? "合格" : "不合格") : "";
    const topics = (item.topics ?? []).join("・");
    const wrongTopics = (item.wrongTopics ?? []).join("・");
    return [date, escape(subject), score, pass, escape(topics), escape(wrongTopics)].join(",");
  });
  return [header, ...rows].join("\n");
}
