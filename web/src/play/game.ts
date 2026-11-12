import { type Cells, PEERS, bit, candidates } from "../lib/sudoku";

export interface Game {
  givens: Cells;
  solution: Cells;
  difficulty: string | null;
  hardest: string | null;
  seed: number | null;
}

interface Snapshot {
  cells: Cells;
  notes: number[];
}

export interface PlayState {
  game: Game;
  cells: Cells;
  /** Pencil marks per cell, bit d-1 for digit d. */
  notes: number[];
  past: Snapshot[];
  future: Snapshot[];
  selected: number;
  notesMode: boolean;
  /** Mark wrong entries in red: off until the player asks. */
  showMistakes: boolean;
  /** Seconds played. */
  elapsed: number;
  solved: boolean;
}

export type Action =
  | { type: "select"; cell: number }
  | { type: "digit"; digit: number }
  | { type: "clear" }
  | { type: "toggleNotes" }
  | { type: "fillNotes" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "toggleMistakes" }
  | { type: "tick"; seconds: number }
  | { type: "apply"; place: [number, number] | null; eliminate: [number, number][] }
  | { type: "erase"; cells: number[] };

const HISTORY = 500;

export function start(game: Game): PlayState {
  return {
    game,
    cells: [...game.givens],
    notes: Array(81).fill(0),
    past: [],
    future: [],
    selected: game.givens.findIndex((d) => d === 0),
    notesMode: false,
    showMistakes: false,
    elapsed: 0,
    solved: false,
  };
}

/** Commits a change as one undoable step, and checks for a finished board. */
function commit(s: PlayState, cells: Cells, notes: number[]): PlayState {
  const past = [...s.past, { cells: s.cells, notes: s.notes }].slice(-HISTORY);
  const solved = cells.every((d, i) => d === s.game.solution[i]);
  return { ...s, cells, notes, past, future: [], solved };
}

export function reduce(s: PlayState, a: Action): PlayState {
  const c = s.selected;
  const given = s.game.givens[c] !== 0;
  switch (a.type) {
    case "select":
      return { ...s, selected: a.cell };
    case "digit": {
      if (s.solved || given || a.digit < 1 || a.digit > 9) return s;
      if (s.notesMode) {
        if (s.cells[c] !== 0) return s;
        const notes = [...s.notes];
        notes[c] = notes[c]! ^ bit(a.digit);
        return commit(s, s.cells, notes);
      }
      const cells = [...s.cells];
      const notes = [...s.notes];
      cells[c] = cells[c] === a.digit ? 0 : a.digit;
      if (cells[c] !== 0) {
        notes[c] = 0;
        // A placed digit can't be a note in its row, column or box any more.
        for (const p of PEERS[c]!) notes[p] = notes[p]! & ~bit(a.digit);
      }
      return commit(s, cells, notes);
    }
    case "clear": {
      if (s.solved || given || (s.cells[c] === 0 && s.notes[c] === 0)) return s;
      const cells = [...s.cells];
      const notes = [...s.notes];
      cells[c] = 0;
      notes[c] = 0;
      return commit(s, cells, notes);
    }
    case "fillNotes": {
      if (s.solved) return s;
      const notes = s.cells.map((d, i) => (d ? 0 : candidates(s.cells, i).reduce((m, n) => m | bit(n), 0)));
      return commit(s, s.cells, notes);
    }
    case "toggleNotes":
      return { ...s, notesMode: !s.notesMode };
    case "toggleMistakes":
      return { ...s, showMistakes: !s.showMistakes };
    case "undo": {
      const prev = s.past.at(-1);
      if (!prev || s.solved) return s;
      return { ...s, ...prev, past: s.past.slice(0, -1), future: [{ cells: s.cells, notes: s.notes }, ...s.future] };
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      const past = [...s.past, { cells: s.cells, notes: s.notes }];
      const solved = next.cells.every((d, i) => d === s.game.solution[i]);
      return { ...s, ...next, past, future: s.future.slice(1), solved };
    }
    case "tick":
      return s.solved ? s : { ...s, elapsed: s.elapsed + a.seconds };
    case "erase": {
      const targets = a.cells.filter((i) => s.game.givens[i] === 0 && s.cells[i] !== 0);
      if (s.solved || targets.length === 0) return s;
      const cells = [...s.cells];
      for (const i of targets) cells[i] = 0;
      return commit(s, cells, s.notes);
    }
    case "apply": {
      if (s.solved) return s;
      const cells = [...s.cells];
      // Apply eliminations to the cells the player has marked; fill marks first if they have none.
      const notes = s.notes.some((n) => n !== 0)
        ? [...s.notes]
        : s.cells.map((d, i) => (d ? 0 : candidates(s.cells, i).reduce((m, n) => m | bit(n), 0)));
      for (const [cell, d] of a.eliminate) notes[cell] = notes[cell]! & ~bit(d);
      if (a.place) {
        const [cell, d] = a.place;
        cells[cell] = d;
        notes[cell] = 0;
        for (const p of PEERS[cell]!) notes[p] = notes[p]! & ~bit(d);
      }
      return { ...commit(s, cells, notes), selected: a.place?.[0] ?? s.selected };
    }
  }
}

/** Entries that differ from the solution. */
export function mistakes(s: PlayState): Set<number> {
  const out = new Set<number>();
  s.cells.forEach((d, i) => {
    if (d !== 0 && s.game.givens[i] === 0 && d !== s.game.solution[i]) out.add(i);
  });
  return out;
}
