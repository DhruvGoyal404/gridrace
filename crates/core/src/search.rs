use crate::Grid;
use crate::solvers;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Algorithm {
    /// First empty cell, digits 1-9, legality by scanning the row, column and box.
    Brute,
    /// Same search tree as `Brute`; legality from 9-bit masks per row, column and box.
    Bitmask,
    /// Minimum remaining values plus naked and hidden singles after every placement.
    Mrv,
    /// Knuth's Algorithm X on the 324-column exact-cover matrix, with Dancing Links.
    Dlx,
}

impl Algorithm {
    pub const ALL: [Algorithm; 4] = [Self::Brute, Self::Bitmask, Self::Mrv, Self::Dlx];

    pub const fn name(self) -> &'static str {
        match self {
            Self::Brute => "brute",
            Self::Bitmask => "bitmask",
            Self::Mrv => "mrv",
            Self::Dlx => "dlx",
        }
    }
}

/// Counters every solver keeps. Time is measured by the caller: `std::time` panics on
/// `wasm32-unknown-unknown`, so the browser times with `performance.now()`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Stats {
    /// Placements tried, forced or guessed.
    pub nodes: u64,
    /// Guesses undone because the branch under them failed (or, when counting, finished).
    pub backtracks: u64,
    /// Legality queries. Brute: one per (cell, digit) tested, each a 27-cell scan.
    /// Bitmask and MRV: one per cell candidate mask built. DLX: one per column size read.
    pub checks: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    /// A branching choice.
    Guess,
    /// A placement with no alternative (propagation, or a DLX column of size 1).
    Forced,
    /// A placement taken back.
    Undo,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Event {
    pub cell: u8,
    pub digit: u8,
    pub step: Step,
}

/// Placements and undos in order, kept up to `cap` events. Never unbounded.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Trace {
    pub events: Vec<Event>,
    /// True if events were dropped after the cap was reached.
    pub capped: bool,
    cap: usize,
}

impl Trace {
    fn push(&mut self, event: Event) {
        if self.events.len() < self.cap {
            self.events.push(event);
        } else {
            self.capped = true;
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Options {
    /// Stop after this many solutions. 2 is enough to prove uniqueness.
    pub max_solutions: u32,
    /// Give up after this many nodes and report `aborted`.
    pub node_limit: u64,
    /// Events to record; 0 records none.
    pub trace_cap: usize,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            max_solutions: 1,
            node_limit: u64::MAX,
            trace_cap: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Outcome {
    /// The first solution found.
    pub solution: Option<Grid>,
    /// Solutions found, at most `max_solutions`. Exact only if `aborted` is false.
    pub solutions: u32,
    pub aborted: bool,
    pub stats: Stats,
    pub trace: Trace,
}

/// The givens break a rule before any search starts.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InvalidGrid {
    pub conflicts: Vec<(u8, u8)>,
}

/// Shared bookkeeping, so the four solvers count the same way.
pub(crate) struct Ctx {
    pub stats: Stats,
    trace: Trace,
    tracing: bool,
    opts: Options,
    solutions: u32,
    first: Option<Grid>,
    aborted: bool,
}

impl Ctx {
    fn new(opts: Options) -> Self {
        Self {
            stats: Stats::default(),
            trace: Trace {
                events: Vec::new(),
                capped: false,
                cap: opts.trace_cap,
            },
            tracing: opts.trace_cap > 0,
            opts: Options {
                max_solutions: opts.max_solutions.max(1),
                ..opts
            },
            solutions: 0,
            first: None,
            aborted: false,
        }
    }

    /// Counts a placement. False once the node limit is passed: the caller unwinds.
    #[inline]
    pub fn node(&mut self) -> bool {
        self.stats.nodes += 1;
        if self.stats.nodes > self.opts.node_limit {
            self.aborted = true;
        }
        !self.aborted
    }

    #[inline]
    pub fn event(&mut self, cell: usize, digit: u8, step: Step) {
        if self.tracing {
            self.trace.push(Event {
                cell: cell as u8,
                digit,
                step,
            });
        }
    }

    /// Records a complete grid. True when the search should stop.
    pub fn found(&mut self, cells: &[u8; 81]) -> bool {
        self.solutions += 1;
        self.first.get_or_insert(Grid(*cells));
        self.solutions >= self.opts.max_solutions
    }
}

/// Runs one solver. The givens must not conflict; that is checked first.
pub fn solve(puzzle: &Grid, algorithm: Algorithm, opts: Options) -> Result<Outcome, InvalidGrid> {
    let conflicts = puzzle.conflicts();
    if !conflicts.is_empty() {
        return Err(InvalidGrid { conflicts });
    }
    let mut ctx = Ctx::new(opts);
    match algorithm {
        Algorithm::Brute => solvers::brute::run(puzzle, &mut ctx),
        Algorithm::Bitmask => solvers::bitmask::run(puzzle, &mut ctx),
        Algorithm::Mrv => solvers::mrv::run(puzzle, &mut ctx),
        Algorithm::Dlx => solvers::dlx::run(puzzle, &mut ctx),
    }
    Ok(Outcome {
        solution: ctx.first,
        solutions: ctx.solutions,
        aborted: ctx.aborted,
        stats: ctx.stats,
        trace: ctx.trace,
    })
}

/// Solutions up to `limit`, with the fastest solver. `None` if the givens conflict.
pub fn count_solutions(puzzle: &Grid, limit: u32) -> Option<u32> {
    let opts = Options {
        max_solutions: limit,
        ..Options::default()
    };
    solve(puzzle, Algorithm::Dlx, opts)
        .ok()
        .map(|o| o.solutions)
}
