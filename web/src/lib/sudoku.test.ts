import { describe, expect, it } from "vitest";
import { PEERS, box, candidates, cellLabel, cellName, clashes, format, parse } from "./sudoku";

const CLASSIC = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

describe("board geometry", () => {
  it("gives every cell 20 peers and numbers boxes left to right", () => {
    expect(PEERS.every((p) => p.length === 20)).toBe(true);
    expect([box(0), box(8), box(40), box(80)]).toEqual([0, 2, 4, 8]);
    expect(cellName(40)).toBe("r5c5");
  });

  it("round-trips the 81-character format", () => {
    expect(format(parse(CLASSIC))).toBe(CLASSIC);
  });

  it("computes candidates from peers and finds clashes", () => {
    const cells = parse(CLASSIC);
    expect(candidates(cells, 2)).toEqual([1, 2, 4]);
    expect(candidates(cells, 0)).toEqual([]);
    cells[2] = 5;
    expect([...clashes(cells)].sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it("labels cells for screen readers", () => {
    expect(cellLabel(0, 5, 0, true)).toBe("Row 1, column 1, 5, given");
    expect(cellLabel(2, 0, 0b1011, false)).toBe("Row 1, column 3, empty, notes 1 2 4");
  });
});
