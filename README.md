# GridRace

[![CI](https://github.com/DhruvGoyal404/gridrace/actions/workflows/ci.yml/badge.svg)](https://github.com/DhruvGoyal404/gridrace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Sudoku solver, generator and **solver race** that shows algorithmic thinking step by
step: four solvers, from brute force to Dancing Links, run on the same puzzle and are
measured side by side.

The solver core is Rust compiled to WebAssembly, running in a Web Worker. Everything runs
in the browser: no backend, no accounts, no server costs.

> **Status:** M1 (Rust core) is done: four instrumented solvers, a unique-solution
> generator, tests, fuzzing and benchmarks. The human-style solver and hints (M2), the
> web app (M3) and deployment to `gridrace.dhruvgoyal.tech` (M4) are next.

## The four solvers

Every solver keeps the same counters, defined once in
[search.rs](crates/core/src/search.rs):

- **nodes**: placements tried, guessed or forced.
- **backtracks**: guesses undone because the branch under them failed.
- **checks**: legality queries. What one query costs differs by solver, and that
  difference is the point.

Median times are over 500 generated puzzles, native, on one laptop core
([docs/BENCHMARKS.md](docs/BENCHMARKS.md) has the method, p95, max and the hardest puzzles).

| # | Solver | Idea | Per-node cost | Mean nodes | Median |
|---|---|---|---|---:|---:|
| 1 | [Brute force](crates/core/src/solvers/brute.rs) | First empty cell, try 1 to 9, scan row, column and box for each digit | 9 digits × 27 reads | 100,090 | 2.20 ms |
| 2 | [Bitmask](crates/core/src/solvers/bitmask.rs) | Same search; a 9-bit mask per row, column and box gives all legal digits in one `!(r \| c \| b)` | O(1) | 100,090 | 0.42 ms |
| 3 | [MRV + propagation](crates/core/src/solvers/mrv.rs) | After each guess, place naked and hidden singles until nothing changes; branch on the cell with fewest candidates | O(81) per propagation pass | 74 | 13 µs |
| 4 | [Dancing Links](crates/core/src/solvers/dlx.rs) | Knuth's Algorithm X on the 729 × 324 exact-cover matrix; cover and uncover are O(1) pointer splices | O(columns) to choose, O(1) per link | 74 | 40 µs |

All four are exponential in the worst case: generalised Sudoku is NP-complete. What
changes is the size of the tree and the cost of each node.

**1 → 2: cheaper checks, same tree.** Bitmask visits exactly the same nodes as brute
force (a test asserts it on 60 puzzles); only the cost of asking "is this digit legal?"
drops from a 27-cell scan per digit to one mask operation per cell. 5.2× faster.

**2 → 3: a smaller tree.** Constraint propagation fills most cells without guessing,
and choosing the most constrained cell (minimum remaining values) keeps the branching
factor near 2. 1,350× fewer nodes, 165× faster than brute force.

**3 → 4: the general method.** Sudoku is an exact-cover problem: 324 constraints
(each cell filled; each digit once per row, column and box), 729 candidate placements,
pick placements covering every constraint exactly once. Algorithm X picks the
constraint with fewest options, which is MRV and hidden singles in one rule. It visits
the same number of nodes as MRV here, but scanning ~200 columns per node makes it about
3× slower than the specialised solver. The same code solves any exact-cover problem.

**Adversarial puzzles.** Relabelling a puzzle's digits so its first row reads
`987654321` makes brute force's first guess wrong in every first-row cell. On the
20 worst such puzzles, brute force's median goes from 2.2 ms to 239 ms; MRV and DLX
don't care (14 µs and 44 µs), because they don't depend on digit order.

## Traces and replay

A solver can record a trace for the step-by-step replay: one event per placement
(guessed or forced) and per undo, nothing else. A trace is never unbounded: it stops at
a cap the caller sets and reports `capped: true`. A test replays every solver's full
trace from the puzzle and checks it ends on the solution.

## Generator

[generate.rs](crates/core/src/generate.rs) fills a random grid, then visits the cells in
random order and empties each one only if the puzzle still has exactly one solution
(counting stops at 2). Every clue left is necessary, so each puzzle is minimal. A seed
names a puzzle forever: the PRNG is a 10-line SplitMix64, identical on every platform.

## Quality

- **Zero dependencies** in the solver core. The PRNG, property tests and bench harness
  are standard library only.
- **Unit tests per solver** and **property tests** over thousands of seeded cases: every
  returned solution is valid and keeps the givens, all four solvers agree on the
  solution count (on generated, partially blanked and random, often unsolvable, grids),
  and traces replay correctly.
- **Fuzzing** with `cargo-fuzz`/libFuzzer: any byte string is parsed and, if it parses,
  solved by all four solvers with a node limit; they must not panic and must agree. Runs
  for 2 minutes on every push.
- **Clippy pedantic**, `rustfmt`, `cargo-deny` (RustSec advisories, licences, sources),
  gitleaks, and a dependency policy: every crate, npm package and toolchain at least 14
  days old, pinned exactly, GitHub Actions pinned by commit SHA.

## Run it

Rust 1.99.1 is pinned in [rust-toolchain.toml](rust-toolchain.toml); `rustup` installs it.

```sh
cargo test                       # unit, property and doc tests
cargo bench                      # median/p95 per solver on data/*.txt
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
