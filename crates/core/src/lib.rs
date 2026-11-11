//! `GridRace` core: four instrumented Sudoku solvers, from brute force to Dancing Links,
//! and a generator whose puzzles have exactly one solution.
//!
//! ```
//! use gridrace_core::{solve, Algorithm, Grid, Options};
//! let p = Grid::parse("53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79").unwrap();
//! let out = solve(&p, Algorithm::Dlx, Options::default()).unwrap();
//! assert!(out.solution.unwrap().solves(&p));
//! ```

pub mod generate;
mod grid;
pub mod rng;
mod search;
mod solvers;

pub use grid::{Grid, ParseError, UNITS, are_peers, box_of, col, row};
pub use search::{
    Algorithm, Event, InvalidGrid, Options, Outcome, Stats, Step, Trace, count_solutions, solve,
};
