/** Board helpers for the UI. Solving and hints live in the worker; this is only geometry. */

export type Cells = number[];

export const row = (c: number) => Math.floor(c / 9);
export const col = (c: number) => c % 9;
export const box = (c: number) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3);

/** The 20 cells sharing a row, column or box with each cell. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, c) =>
  Array.from({ length: 81 }, (_, p) => p).filter(
    (p) => p !== c && (row(p) === row(c) || col(p) === col(c) || box(p) === box(c)),
  ),
);

export function parse(text: string): Cells {
  return [...text].map((ch) => (ch >= "1" && ch <= "9" ? Number(ch) : 0));
}

export function format(cells: Cells): string {
  return cells.map((d) => (d === 0 ? "." : String(d))).join("");
}

/** "r4c6", as the explanations write it. */
export function cellName(c: number): string {
  return `r${row(c) + 1}c${col(c) + 1}`;
}

/** Digits still possible in an empty cell, from its peers' digits. */
export function candidates(cells: Cells, c: number): number[] {
  if (cells[c] !== 0) return [];
  const used = new Set(PEERS[c]!.map((p) => cells[p]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d));
}

/** Cells whose digit repeats in a row, column or box. */
export function clashes(cells: Cells): Set<number> {
  const out = new Set<number>();
  cells.forEach((d, c) => {
    if (d !== 0 && PEERS[c]!.some((p) => cells[p] === d)) out.add(c);
  });
  return out;
}

export const bit = (d: number) => 1 << (d - 1);
export const hasNote = (mask: number, d: number) => (mask & bit(d)) !== 0;

/** Accessible name for a cell: position, then content. */
export function cellLabel(c: number, digit: number, notes: number, given: boolean): string {
  const where = `Row ${row(c) + 1}, column ${col(c) + 1}`;
  if (digit) return `${where}, ${digit}${given ? ", given" : ""}`;
  const marks = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => hasNote(notes, d));
  return marks.length ? `${where}, empty, notes ${marks.join(" ")}` : `${where}, empty`;
}
