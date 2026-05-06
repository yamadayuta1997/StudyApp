export function moveItem<T>(arr: T[], fromIndex: number, direction: 'up' | 'down'): T[] {
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= arr.length) return arr;
  const result = [...arr];
  [result[fromIndex], result[toIndex]] = [result[toIndex], result[fromIndex]];
  return result;
}
