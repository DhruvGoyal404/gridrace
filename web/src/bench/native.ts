/**
 * Native medians in microseconds, copied from docs/BENCHMARKS.md ("Every set, in full",
 * measured 2026-11-12, i5-1235U pinned to one performance core). Order: brute, bitmask,
 * mrv, dlx. Update together with that file.
 */
export const NATIVE: Record<string, [number, number, number, number]> = {
  Easy: [3260, 446.5, 12.0, 29.5],
  Medium: [3780, 602.3, 21.5, 36.4],
  Hard: [3600, 631.5, 20.4, 37.3],
  Expert: [3020, 563.1, 17.8, 36.4],
  Master: [4060, 720.9, 26.5, 47.3],
  Beyond: [4640, 755.6, 30.0, 55.0],
  "hardest.txt": [8990, 1250, 220.4, 272.2],
  "adversarial.txt": [308380, 53400, 16.7, 38.4],
};

/** Nearest-rank percentile of a sorted list, as the native bench computes it. */
export function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? NaN;
}
