/** Messages between the UI and the solver worker. Results mirror crates/wasm/src/lib.rs. */

export const ALGORITHMS = [
  { index: 0, code: "BRT", name: "Brute force", key: "brute" },
  { index: 1, code: "BIT", name: "Bitmask", key: "bitmask" },
  { index: 2, code: "MRV", name: "MRV + propagation", key: "mrv" },
  { index: 3, code: "DLX", name: "Dancing Links", key: "dlx" },
] as const;
export type AlgoIndex = (typeof ALGORITHMS)[number]["index"];

export const TIERS = ["Easy", "Medium", "Hard", "Expert", "Master", "Beyond"] as const;
export type Tier = (typeof TIERS)[number];

export interface Analysis {
  puzzle: string;
  givens: number;
  conflicts: [number, number][];
  solutions: number;
  solution: string | null;
  difficulty: Tier | null;
  hardest: string | null;
}

export interface Solved {
  algorithm: string;
  solutions: number;
  aborted: boolean;
  solution: string | null;
  stats: { nodes: number; backtracks: number; checks: number };
  trace_events: number;
  trace_capped: boolean;
}

export interface Timed extends Solved {
  /** Microseconds per solve, measured without a trace. */
  micros: number;
  /** How many solves the timing averaged. */
  reps: number;
  /** Three bytes per event: cell, digit, kind (0 guess, 1 forced, 2 undo). */
  trace: Uint8Array;
}

export interface Generated {
  seed: number;
  puzzle: string;
  solution: string;
  difficulty: Tier;
  hardest: string | null;
}

export interface HintStep {
  technique: string;
  rating: string;
  difficulty: Tier;
  place: [number, number] | null;
  eliminate: [number, number][];
  cells: number[];
  digits: number[];
  unit: string | null;
  explanation: string;
}

export type HintResult =
  | { kind: "conflict"; pairs: [number, number][] }
  | { kind: "not_unique"; solutions: number }
  | { kind: "mistakes"; cells: number[] }
  | { kind: "solved" }
  | { kind: "steps"; steps: HintStep[] }
  | { kind: "reveal"; cell: number; digit: number; candidates: number[] };

export type Request =
  | { type: "analyze"; text: string }
  | { type: "race"; puzzle: string; algo: AlgoIndex; nodeLimit: number; traceCap: number }
  | { type: "time"; puzzle: string; algo: AlgoIndex; nodeLimit: number }
  | { type: "generate"; tier: number; seed: number }
  | { type: "hint"; givens: string; current: string };

export interface TimeResult {
  micros: number;
  reps: number;
  nodes: number;
  aborted: boolean;
}

export type Response =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };
