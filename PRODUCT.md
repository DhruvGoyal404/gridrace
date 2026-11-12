# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript + Vite + Tailwind CSS, with the solver core in Rust compiled to
WebAssembly (wasm-bindgen) and run in a Web Worker. Static site on Cloudflare Pages at
gridrace.dhruvgoyal.tech. No backend. (Set by the owner's brief.)

## Users

- **Primary: interviewers and developers** evaluating the owner's algorithmic thinking.
  They arrive from a resume or GitHub link, have a few minutes, and want to see the
  algorithms work and the numbers behind them.
- **Second: Sudoku players** who want to play, get hints that explain why, and generate
  puzzles at a chosen difficulty. Play mode must feel as good as Race: it is a product
  for them, not a demo.

## Product Purpose

GridRace solves, generates and explains Sudoku, and races four solvers (brute force,
bitmask, MRV + constraint propagation, Dancing Links) on the same puzzle so the
difference between them is visible: nodes explored, backtracks, checks, time, and a
step-by-step replay. Success: a visitor understands within a minute why the later
algorithms are faster, from measured numbers on screen, and can verify it on any
puzzle they paste.

## Positioning

The race is real and instrumented: the same Rust code that is benchmarked in the repo
runs in the visitor's browser, counts every node, and replays its own trace. Hints come
from a human-style solver with seventeen named techniques and say why a move is forced,
in plain language. Difficulty is graded by the hardest technique needed, not by empty
cells.

## Operating Context

- First visit is usually on a laptop from a link; a phone is common for a quick look.
- Interviewers may screen-share it during a call.
- Players use it for longer sessions, often keyboard-only on desktop.
- Works offline once loaded (PWA).

## Capabilities and Constraints

- Modes: Race (four solvers side by side, counters, replay with play/pause/speed/step),
  Play (digits, notes / pencil marks, undo and redo, an optional mistakes check, a timer,
  and a hint ladder that reveals as little as needed: the technique first, then where to
  look, then the full explanation with highlighted cells, then the placement), Generate (Easy, Medium, Hard, Expert, Master, Beyond; shareable by seed),
  Paste (81-character string, validated: conflicts, no solution, several solutions are
  explained).
- Traces are capped; the UI says when a replay was capped. Brute force may hit a node
  limit on hard puzzles; the UI says so instead of hanging.
- Solving runs in a Web Worker; the UI never freezes.
- Terms: "nodes", "backtracks", "checks" as defined in `crates/core/src/search.rs`;
  technique names as in `crates/core/src/human.rs`; cells as r1c1..r9c9.
- Landing page: crawlable HTML explaining the product and the four algorithms, leading
  into the live race.

## Brand Commitments

- Name: GridRace. Personal portfolio project of Dhruv Goyal (MIT).
- Voice: precise and numbers-first, like the README: say what happened and why, no hype.

## Evidence on Hand

- Measured native benchmarks in docs/BENCHMARKS.md (per tier, hardest and adversarial
  sets). The in-browser bench page will add WebAssembly numbers.
- No testimonials, users, press or logos exist; none may be invented.

## Product Principles

1. Show, then explain: the race and its counters come first; the prose explains what
   was just seen.
2. Every number on screen is measured by the code running in the browser, never a
   canned figure.
3. A hint teaches: it names the technique and the reason, and highlights the cells that
   prove it.
4. Never freeze, never lie: long searches report progress or limits, capped traces say
   they're capped.
5. Players come first in Play: the hint ladder gives the smallest nudge that helps, and
   mistakes are shown only when the player asks for them.

## Accessibility & Inclusion

WCAG 2.1 AA, axe-clean. Fully keyboard-playable (grid navigation, digit entry, pencil
marks, replay controls). Light and dark themes. Respects reduced motion. Responsive from
phone to desktop.
