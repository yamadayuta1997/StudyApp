export type PassFailFilter = "all" | "pass" | "fail";
export type SortOrder = "newest" | "oldest";

interface FilterableItem {
  subject: string;
  score: number | null;
  date: string;
}

export function filterBySubject<T extends FilterableItem>(items: T[], subject: string | null): T[] {
  if (!subject) return items;
  return items.filter((h) => h.subject === subject);
}

export function filterByPassFail<T extends FilterableItem>(items: T[], filter: PassFailFilter): T[] {
  if (filter === "all") return items;
  return items.filter((h) => {
    if (h.score === null) return false;
    return filter === "pass" ? h.score >= 70 : h.score < 70;
  });
}

export function sortByDate<T extends FilterableItem>(items: T[], order: SortOrder): T[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    return order === "newest" ? tb - ta : ta - tb;
  });
}

export function applyFilters<T extends FilterableItem>(
  items: T[],
  subject: string | null,
  passFailFilter: PassFailFilter,
  sortOrder: SortOrder
): T[] {
  return sortByDate(filterByPassFail(filterBySubject(items, subject), passFailFilter), sortOrder);
}
