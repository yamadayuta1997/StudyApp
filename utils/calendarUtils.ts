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
