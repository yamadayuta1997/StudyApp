export function pageToX(page: number, min: number, max: number, trackWidth: number): number {
  if (trackWidth === 0 || max <= min) return 0;
  return ((page - min) / (max - min)) * trackWidth;
}

export function xToPage(x: number, min: number, max: number, trackWidth: number): number {
  if (trackWidth === 0 || max <= min) return min;
  const clamped = Math.max(0, Math.min(trackWidth, x));
  return Math.round(min + (clamped / trackWidth) * (max - min));
}

export function clampFrom(value: number, min: number, to: number): number {
  return Math.max(min, Math.min(to - 1, value));
}

export function clampTo(value: number, from: number, max: number): number {
  return Math.min(max, Math.max(from + 1, value));
}
