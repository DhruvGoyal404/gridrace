import { describe, expect, it } from "vitest";
import { bit, parse } from "../lib/sudoku";
import { type PlayState, mistakes, reduce, start } from "./game";

const PUZZLE = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

function game(): PlayState {
  return start({ givens: parse(PUZZLE), solution: parse(SOLUTION), difficulty: "Easy", hardest: null, seed: null });
}

const at = (s: PlayState, cell: number) => reduce(s, { type: "select", cell });

describe("play", () => {
  it("starts on the first empty cell and ignores givens", () => {
    const s = game();
    expect(s.selected).toBe(2);
    const onGiven = reduce(at(s, 0), { type: "digit", digit: 9 });
    expect(onGiven.cells[0]).toBe(5);
    expect(onGiven.past).toHaveLength(0);
  });

  it("places, toggles off with the same digit, and clears peer notes", () => {
    let s = at(game(), 3);
    s = reduce(s, { type: "toggleNotes" });
    s = reduce(s, { type: "digit", digit: 6 });
    s = reduce(at(s, 2), { type: "digit", digit: 6 });
    expect(s.notes[3]).toBe(bit(6));
    s = reduce(s, { type: "toggleNotes" });
    s = reduce(s, { type: "digit", digit: 4 });
    s = reduce(at(s, 3), { type: "digit", digit: 6 });
    expect(s.cells[3]).toBe(6);
    expect(s.notes[2]).toBe(0);
    s = reduce(s, { type: "digit", digit: 6 });
    expect(s.cells[3]).toBe(0);
  });

  it("undoes and redoes every change, and a new change clears redo", () => {
    let s = reduce(game(), { type: "digit", digit: 4 });
    s = reduce(at(s, 3), { type: "digit", digit: 6 });
    s = reduce(s, { type: "undo" });
    expect(s.cells[3]).toBe(0);
    s = reduce(s, { type: "undo" });
    expect(s.cells[2]).toBe(0);
    s = reduce(s, { type: "redo" });
    expect(s.cells[2]).toBe(4);
    s = reduce(at(s, 5), { type: "digit", digit: 8 });
    expect(s.future).toHaveLength(0);
  });

  it("reports mistakes only against the solution", () => {
    let s = reduce(game(), { type: "digit", digit: 1 });
    expect([...mistakes(s)]).toEqual([2]);
    s = reduce(s, { type: "digit", digit: 4 });
    expect(mistakes(s).size).toBe(0);
  });

  it("applies a hint as one step: eliminations, then the placement", () => {
    let s = reduce(game(), { type: "fillNotes" });
    expect(s.notes[2]).toBe(bit(1) | bit(2) | bit(4));
    s = reduce(s, { type: "apply", place: [2, 4], eliminate: [[3, 2]] });
    expect(s.cells[2]).toBe(4);
    expect(s.notes[3]! & bit(2)).toBe(0);
    expect(s.selected).toBe(2);
    expect(reduce(s, { type: "undo" }).cells[2]).toBe(0);
  });

  it("erases wrong entries as one step, never givens", () => {
    let s = reduce(game(), { type: "digit", digit: 1 });
    s = reduce(s, { type: "erase", cells: [0, 2] });
    expect([s.cells[0], s.cells[2]]).toEqual([5, 0]);
    expect(reduce(s, { type: "undo" }).cells[2]).toBe(1);
  });

  it("finishes when the board matches the solution and stops the clock", () => {
    let s = game();
    for (let c = 0; c < 81; c++) {
      if (s.cells[c] === 0) s = reduce(at(s, c), { type: "digit", digit: Number(SOLUTION[c]) });
    }
    expect(s.solved).toBe(true);
    expect(reduce(s, { type: "tick", seconds: 5 }).elapsed).toBe(s.elapsed);
    expect(reduce(s, { type: "undo" })).toBe(s);
  });
});
