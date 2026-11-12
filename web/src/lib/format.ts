const int = new Intl.NumberFormat("en-US");

export const count = (n: number) => int.format(Math.round(n));

/** Microseconds as the most readable unit: "12.0 µs", "3.26 ms", "1.07 s". */
export function duration(micros: number): string {
  if (micros < 1000) return `${micros.toFixed(1)} µs`;
  if (micros < 1e6) return `${(micros / 1000).toFixed(2)} ms`;
  return `${(micros / 1e6).toFixed(2)} s`;
}

/** Seconds as m:ss or h:mm:ss, for the game clock. */
export function clock(seconds: number): string {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000_000;
}
