export type Workbook = {
  id: string;
  name: string;
  subject: string;
  pages: number;
  rounds: number;
  order: number;
};

export type StudyTask = {
  id: string;
  date: string;
  subject: string;
  workbookId: string;
  workbookName: string;
  round: number;
  title: string;
  startPage: number;
  endPage: number;
  done: boolean;
};

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getRemainingDays(examDate: string, from?: Date): number | null {
  if (!examDate) return null;
  const now = from ? new Date(from) : new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam.getTime() - now.getTime()) / 86400000);
}

export type StreakInfo = {
  currentStreak: number;
  longestStreak: number;
  studiedDates: Set<string>;
};

function normalizeHistoryDate(dateStr: string): string {
  // Converts "2026/5/9" (ja-JP locale) or "2026-05-09" to "YYYY-MM-DD"
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function computeStreak(historyDates: string[], today?: Date): StreakInfo {
  const todayDate = today ? new Date(today) : new Date();
  todayDate.setHours(0, 0, 0, 0);

  const studiedDates = new Set(historyDates.map(normalizeHistoryDate));
  const sortedDates = [...studiedDates].sort();

  if (sortedDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, studiedDates };
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const diffDays = Math.round(
      (new Date(sortedDates[i]).getTime() - new Date(sortedDates[i - 1]).getTime()) / 86400000
    );
    if (diffDays === 1) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else if (diffDays > 1) {
      run = 1;
    }
  }

  const todayStr = formatDate(todayDate);
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(todayDate.getDate() - 1);
  const yesterdayStr = formatDate(yesterdayDate);

  let currentStreak = 0;
  if (studiedDates.has(todayStr) || studiedDates.has(yesterdayStr)) {
    const checkFrom = studiedDates.has(todayStr) ? new Date(todayDate) : new Date(yesterdayDate);
    while (studiedDates.has(formatDate(checkFrom))) {
      currentStreak++;
      checkFrom.setDate(checkFrom.getDate() - 1);
    }
  }

  return { currentStreak, longestStreak, studiedDates };
}

// Generates tasks by allocating pages across days sequentially.
// Books are processed in order (order field), and each round of a book
// completes before the next begins.
export function generateTasksFromWorkbooks(
  examDate: string,
  workbooks: Workbook[],
  fromDate?: Date
): StudyTask[] {
  const now = fromDate ? new Date(fromDate) : new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  const remainingDays = Math.floor((exam.getTime() - now.getTime()) / 86400000);

  if (remainingDays <= 0 || workbooks.length === 0) return [];

  const sorted = [...workbooks].sort((a, b) => a.order - b.order);

  type Segment = { workbook: Workbook; round: number };
  const queue: Segment[] = [];
  for (const wb of sorted) {
    for (let r = 1; r <= wb.rounds; r++) {
      queue.push({ workbook: wb, round: r });
    }
  }

  const totalPages = queue.reduce((sum, seg) => sum + seg.workbook.pages, 0);
  if (totalPages === 0) return [];

  const pagesPerDay = Math.ceil(totalPages / remainingDays);
  const tasks: StudyTask[] = [];

  let queueIdx = 0;
  let pageOffset = 0;

  for (let d = 0; d < remainingDays && queueIdx < queue.length; d++) {
    const taskDate = new Date(now);
    taskDate.setDate(now.getDate() + d);
    const dateStr = formatDate(taskDate);
    let remainingToday = pagesPerDay;

    while (remainingToday > 0 && queueIdx < queue.length) {
      const { workbook: wb, round } = queue[queueIdx];
      const remainingInSeg = wb.pages - pageOffset;
      const take = Math.min(remainingToday, remainingInSeg);
      const startPage = pageOffset + 1;
      const endPage = pageOffset + take;

      tasks.push({
        id: `${dateStr}_${wb.id}_r${round}_p${startPage}`,
        date: dateStr,
        subject: wb.subject,
        workbookId: wb.id,
        workbookName: wb.name,
        round,
        title: `${wb.name}（第${round}周）p.${startPage}–${endPage}`,
        startPage,
        endPage,
        done: false,
      });

      pageOffset += take;
      remainingToday -= take;

      if (pageOffset >= wb.pages) {
        queueIdx++;
        pageOffset = 0;
      }
    }
  }

  return tasks;
}
