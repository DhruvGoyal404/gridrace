# GridRace

[![CI](https://github.com/DhruvGoyal404/gridrace/actions/workflows/ci.yml/badge.svg)](https://github.com/DhruvGoyal404/gridrace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Sudoku solver, generator and **solver race** that shows algorithmic thinking step by
step: four solvers, from brute force to Dancing Links, run on the same puzzle and are
measured side by side.

The solver core is Rust compiled to WebAssembly, running in a Web Worker. Everything runs
in the browser: no backend, no accounts, no server costs.

> **Status:** the Rust core (M1), the human-style solver with graded generation (M2) and
> the web app (M3: Race, Play, Bench) are done. Deployment to `gridrace.dhruvgoyal.tech`
> with offline support (M4) is next. Until then: `cd web && npm ci && npm run wasm && npm run dev`.

## The web app

- **Race**: four workers, one per solver, race on the same puzzle. Each lane shows its
  status, time per solve (measured without the trace), nodes, backtracks and checks;
  choose a lane to replay its search on the board with split-flap arrivals, at any speed,
  step by step.
- **Play**: notes, undo and redo, an opt-in mistakes check, a timer, and a hint ladder
  that reveals as little as needed: the technique, where to look, why, then the move.
- **Bench**: the benchmark corpus timed in your browser next to the native medians
  ([docs/BENCHMARKS.md](docs/BENCHMARKS.md#in-the-browser) explains why the two methods
  aren't a like-for-like race).
- Light and dark boards, keyboard-playable, axe-clean (WCAG 2.1 AA) on desktop and phone.

## The four solvers

Every solver keeps the same counters, defined once in
[search.rs](crates/core/src/search.rs):

- **nodes**: placements tried, guessed or forced.
- **backtracks**: guesses undone because the branch under them failed.
- **checks**: legality queries. What one query costs differs by solver, and that
  difference is the point.

Medians are native, on one pinned laptop core, for 100 Easy puzzles and for the 50
puzzles built to be hardest for the smart solvers ([docs/BENCHMARKS.md](docs/BENCHMARKS.md)
has every tier, p95, max, the method and the hardest puzzles).

| # | Solver | Idea | Per-node cost | Easy: median (nodes) | Hardest: median (nodes) |
|---|---|---|---|---:|---:|
| 1 | [Brute force](crates/core/src/solvers/brute.rs) | First empty cell, try 1 to 9, scan row, column and box for each digit | 9 digits × 27 reads | 3.26 ms (164,517) | 8.99 ms (194,314) |
| 2 | [Bitmask](crates/core/src/solvers/bitmask.rs) | Same search; a 9-bit mask per row, column and box gives all legal digits in one `!(r \| c \| b)` | O(1) | 447 µs (164,517) | 1.25 ms (194,314) |
| 3 | [MRV + propagation](crates/core/src/solvers/mrv.rs) | After each guess, place naked and hidden singles until nothing changes; branch on the cell with fewest candidates | O(81) per propagation pass | 12.0 µs (56) | 220 µs (701) |
| 4 | [Dancing Links](crates/core/src/solvers/dlx.rs) | Knuth's Algorithm X on the 729 × 324 exact-cover matrix; cover and uncover are O(1) pointer splices | O(columns) to choose, O(1) per link | 29.5 µs (56) | 272 µs (799) |

All four are exponential in the worst case: generalised Sudoku is NP-complete. What
changes is the size of the tree and the cost of each node.

**1 → 2: cheaper checks, same tree.** Bitmask visits exactly the same nodes as brute
force (a test asserts it); only the cost of asking "is this digit legal?" drops from a
27-cell scan per digit to one mask operation per cell. 5.4 to 7.3× faster.

**2 → 3: a smaller tree.** Constraint propagation fills most cells without guessing,
and choosing the most constrained cell (minimum remaining values) keeps the branching
factor near 2. Hundreds to thousands of times fewer nodes.

**3 → 4: the general method.** Sudoku is an exact-cover problem: 324 constraints
(each cell filled; each digit once per row, column and box), 729 candidate placements,
pick placements covering every constraint exactly once. Algorithm X picks the
constraint with fewest options, which is MRV and hidden singles in one rule. On easy
ground DLX takes 1.7 to 2.5× MRV's median: propagation settles most cells for free while
DLX pays pointer work per node. On the hardest set, where both must really search, the
gap closes to 1.24× at the median and 1.2× at the max. Profiling showed 40% of DLX's
time went into building the matrix; [docs/BENCHMARKS.md](docs/BENCHMARKS.md#dlx-tuning-2026-11-12)
records what changed and the before/after ratios. The same code solves any exact-cover
problem.

**Adversarial puzzles.** Relabelling a puzzle's digits so its first row reads
`987654321` makes brute force's first guess wrong in every first-row cell. On the
20 worst such puzzles brute force's median is 308 ms; MRV and DLX don't care (17 µs and
38 µs), because they don't depend on digit order.

**Human difficulty is not machine difficulty.** From Easy to Beyond, MRV's mean nodes
only rise from 56 to 103, and brute force is costliest on the Easy tier. That's why the
benchmark has sets built against the solvers, not only graded ones.

## Traces and replay

A solver can record a trace for the step-by-step replay: one event per placement
(guessed or forced) and per undo, nothing else. A trace is never unbounded: it stops at
a cap the caller sets and reports `capped: true`. A test replays every solver's full
trace from the puzzle and checks it ends on the solution.

## Human-style solver and hints

[human.rs](crates/core/src/human.rs) solves the way a person does: pencil marks, then the
easiest technique that makes progress. Seventeen techniques, in the order of Sudoku
Explainer's difficulty ratings (read from its source, cited in the file):

| Rating | Technique | What it does |
|---:|---|---|
| 1.2 / 1.5 | Hidden single | A digit fits in only one cell of a box, row or column |
| 2.3 | Naked single | A cell has only one candidate left |
| 2.6 | Pointing | A digit's spots in a box all lie on one line: remove it from the rest of the line |
| 2.8 | Box-line reduction | A digit's spots on a line all lie in one box: remove it from the rest of the box |
| 3.0 | Naked pair | Two cells of a unit share the same two candidates |
| 3.2 | X-Wing | A digit fits in two rows only within the same two columns |
| 3.4 | Hidden pair | Two digits fit in only the same two cells of a unit |
| 3.6 | Naked triple | Three cells hold only three digits between them |
| 3.8 | Swordfish | X-Wing over three rows and three columns |
| 4.0 | Hidden triple | Three digits fit in only the same three cells |
| 4.0 | Skyscraper | Two parallel strong links on a digit whose near ends share a line: one far end holds it |
| 4.1 | 2-String Kite | A row and a column strong link joined in a box: one far end holds the digit |
| - | W-Wing | Two identical two-candidate cells joined by a strong link: one of them is the other digit |
| 4.2 | XY-Wing | A two-candidate pivot and two pincers force a third digit out of shared peers |
| 4.5 | Unique rectangle | Three corners hold only {x, y}: the fourth can't, or the puzzle would have two solutions |
| 6.6+ | X-Chain | Alternating strong and weak links on one digit: one end of the chain holds it |
| 7.0+ | XY-Chain | A chain of two-candidate cells: one end must be the shared digit |

Skyscraper and 2-String Kite are rated by Sukaku Explainer, SE's maintained fork. SE
doesn't rate W-Wing; it sits where HoDoKu, the other widely used rated solver, searches
it: after the Kite, before XY-Wing. Unique rectangle relies on the puzzle having exactly
one solution, which generated puzzles do and hints check first. Chains are found
breadth-first, so a hint shows the shortest chain that works.

Every step carries the cells and digits of its pattern (for highlighting) and an
explanation, for example:

> Hidden single: in box 1, 5 fits only in r2c2. No other cell of the box can hold a 5.

> XY-Wing: r1c1 is 1 or 2. If 1, r1c5 must be 3; if 2, r5c1 must be 3. Either way one
> of them is 3, so it removes 3 from r5c5.

> X-Chain on 7: If r1c1 isn't 7, r1c5 is (the only other 7 in row 1), so r4c5 isn't (it
> sees r1c5), r4c9 is (the only other 7 in row 4), so r8c9 isn't (it sees r4c9), r8c2 is
> (the only other 7 in row 8). So r1c1 or r8c2 is 7, and this removes 7 from r2c2, r3c2,
> r7c1 and r9c1.

**Hints** check, in order: clashing digits, whether the puzzle has exactly one solution,
entries that differ from it, then the deductions leading to the next placement. Steps
the placement doesn't need are pruned, so a hint is a short chain ending in "place this
digit here, because...". When no technique applies, the hint reveals the cell with the
fewest candidates and says so.

**Grading** uses the hardest technique an easiest-first solve needs, not the number of
empty cells: Easy (singles), Medium (pointing, box-line), Hard (pairs, X-Wing), Expert
(triples, Swordfish, Skyscraper, Kite, W-Wing, XY-Wing, unique rectangle), Master
(X-Chain, XY-Chain), Beyond (needs more than these: longer mixed chains, or guessing).

Over 20,000 generated minimal puzzles:

| Tier | Eleven techniques | Seventeen techniques |
|---|---:|---:|
| Easy | 41.5% | 41.5% |
| Medium | 11.9% | 11.9% |
| Hard | 6.5% | 6.5% |
| Expert | 4.9% | 16.2% |
| Master | - | 7.9% |
| Beyond | 35.1% | **15.9%** |

So about one puzzle in six still ends a hint with "here's a cell", against one in three
before the chain and uniqueness techniques.

## Generator

[generate.rs](crates/core/src/generate.rs) fills a random grid, then visits the cells in
random order and empties each one only if the puzzle still has exactly one solution
(counting stops at 2). Every clue left is necessary, so each puzzle is minimal.
`puzzle_of(difficulty, seed, attempts)` walks seeds until the grade matches, and returns
the seed, so any puzzle can be shared as one number: the PRNG is a 10-line SplitMix64,
identical on every platform.

## Quality

- **Zero dependencies** in the solver core. The PRNG, property tests and bench harness
  are standard library only.
- **Unit tests per solver** and **property tests** over thousands of seeded cases: every
  returned solution is valid and keeps the givens, all four solvers agree on the
  solution count (on generated, partially blanked and random, often unsolvable, grids),
  and traces replay correctly.
- **Each technique** has a test on a hand-built candidate board, and property tests over
  hundreds of generated puzzles check that **every step is sound** (no placement or
  elimination contradicts the known solution), every technique occurs, and following
  hints from the start always reaches the solution.
- **Fuzzing** with `cargo-fuzz`/libFuzzer: any byte string is parsed and, if it parses,
  solved by all four solvers with a node limit (they must not panic and must agree),
  graded, and hinted (no step may contradict the solution). Runs for 2 minutes on every
  push.
- **Clippy pedantic**, `rustfmt`, `cargo-deny` (RustSec advisories, licences, sources),
  gitleaks, and a dependency policy: every crate, npm package and toolchain at least 14
  days old, pinned exactly, GitHub Actions pinned by commit SHA.

## Run it

Rust 1.99.1 is pinned in [rust-toolchain.toml](rust-toolchain.toml); `rustup` installs it.

```sh
cargo test                       # unit, property and doc tests
cargo bench                      # median/p95 per solver, per tier, on data/*.txt
cargo run --release -p gridrace-core --example corpus   # regenerate data/
bash scripts/gate.sh             # the full local gate
```

## Hosting

The finished app will be a static site on Cloudflare Pages at
`gridrace.dhruvgoyal.tech`. Nothing bills while it sits idle (free tier, no servers,
no databases), so unlike my other deployed projects it has no up/down scripts.

## License

[MIT](LICENSE). The benchmark puzzles are generated by this repository and share its
licence.
