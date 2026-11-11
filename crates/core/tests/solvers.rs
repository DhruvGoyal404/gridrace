//! Behaviour every solver must share, plus seeded property tests: the same seed always
//! produces the same cases, so a failure names a reproducible seed.

use gridrace_core::generate::{minimal_puzzle, random_solution};
use gridrace_core::rng::Rng;
use gridrace_core::{Algorithm, Grid, Options, Outcome, Step, solve};

const CLASSIC: &str =
    "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
const CLASSIC_SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

fn run(p: &Grid, algorithm: Algorithm, max_solutions: u32) -> Outcome {
    let opts = Options {
        max_solutions,
        ..Options::default()
    };
    solve(p, algorithm, opts).expect("givens are consistent")
}

#[test]
fn every_solver_solves_the_classic() {
    let p = Grid::parse(CLASSIC).unwrap();
    for a in Algorithm::ALL {
        let out = run(&p, a, 2);
        assert_eq!(out.solutions, 1, "{a:?}");
        assert_eq!(out.solution.unwrap().to_string(), CLASSIC_SOLUTION, "{a:?}");
        assert!(!out.aborted);
        assert!(
            out.stats.nodes >= 51,
            "{a:?} placed {} of 51",
            out.stats.nodes
        );
    }
}

#[test]
fn a_full_valid_grid_is_its_own_solution_with_no_search() {
    let p = Grid::parse(CLASSIC_SOLUTION).unwrap();
    for a in Algorithm::ALL {
        let out = run(&p, a, 2);
        assert_eq!((out.solutions, out.stats.nodes), (1, 0), "{a:?}");
    }
}

#[test]
fn the_empty_grid_has_more_than_one_solution() {
    for a in Algorithm::ALL {
        let out = run(&Grid::EMPTY, a, 2);
        assert_eq!(out.solutions, 2, "{a:?}");
        assert!(out.solution.unwrap().solves(&Grid::EMPTY));
    }
}

#[test]
fn an_unsolvable_puzzle_without_direct_conflicts_has_no_solution() {
    // Cell 8 needs a 9, but the 9 at cell 17 shares its box.
    let p = Grid::parse(&format!("12345678.{}{}", "........9", ".".repeat(63))).unwrap();
    assert_eq!(p.conflicts(), vec![]);
    for a in Algorithm::ALL {
        let out = run(&p, a, 2);
        assert_eq!((out.solutions, out.solution), (0, None), "{a:?}");
    }
}

#[test]
fn conflicting_givens_are_rejected_before_search() {
    let p = Grid::parse(&format!("55{}", ".".repeat(79))).unwrap();
    for a in Algorithm::ALL {
        assert_eq!(
            solve(&p, a, Options::default()).unwrap_err().conflicts,
            vec![(0, 1)]
        );
    }
}

#[test]
fn the_node_limit_aborts() {
    let p = Grid::parse(CLASSIC).unwrap();
    for a in Algorithm::ALL {
        let opts = Options {
            node_limit: 5,
            ..Options::default()
        };
        let out = solve(&p, a, opts).unwrap();
        assert!(out.aborted, "{a:?}");
        assert_eq!(
            out.stats.nodes, 6,
            "{a:?} stops on the first node past the limit"
        );
    }
}

/// Applies events to the puzzle; an uncapped trace of a solved run ends on the solution.
fn replay(p: &Grid, out: &Outcome) -> Grid {
    let mut g = *p;
    for e in &out.trace.events {
        let cell = &mut g.0[e.cell as usize];
        match e.step {
            Step::Guess | Step::Forced => {
                assert_eq!(*cell, 0, "placed on a filled cell");
                *cell = e.digit;
            }
            Step::Undo => {
                assert_eq!(*cell, e.digit, "undid a digit that wasn't there");
                *cell = 0;
            }
        }
    }
    g
}

#[test]
fn traces_replay_to_the_solution_and_respect_the_cap() {
    let (p, solution) = minimal_puzzle(3);
    for a in Algorithm::ALL {
        let full = Options {
            trace_cap: usize::MAX,
            ..Options::default()
        };
        let out = solve(&p, a, full).unwrap();
        assert!(!out.trace.capped);
        assert_eq!(replay(&p, &out), solution, "{a:?}");
        let undos = out
            .trace
            .events
            .iter()
            .filter(|e| e.step == Step::Undo)
            .count() as u64;
        assert!(undos >= out.stats.backtracks, "{a:?}");

        let capped = Options {
            trace_cap: 10,
            ..Options::default()
        };
        let out = solve(&p, a, capped).unwrap();
        assert_eq!(
            (out.trace.events.len(), out.trace.capped),
            (10, true),
            "{a:?}"
        );
        let untraced = solve(&p, a, Options::default()).unwrap();
        assert_eq!(untraced.trace.events, vec![]);
    }
}

#[test]
fn property_generated_puzzles_all_solvers_agree() {
    for seed in 100..160 {
        let (p, solution) = minimal_puzzle(seed);
        let outs: Vec<_> = Algorithm::ALL.iter().map(|&a| run(&p, a, 2)).collect();
        for (a, out) in Algorithm::ALL.iter().zip(&outs) {
            assert_eq!(out.solutions, 1, "seed {seed} {a:?}");
            assert_eq!(out.solution, Some(solution), "seed {seed} {a:?}");
        }
        // Bitmask changes how a check is done, not which nodes are visited.
        assert_eq!(outs[0].stats.nodes, outs[1].stats.nodes, "seed {seed}");
        assert_eq!(
            outs[0].stats.backtracks, outs[1].stats.backtracks,
            "seed {seed}"
        );
    }
}

#[test]
fn property_partial_grids_all_solvers_agree_on_the_count() {
    let mut rng = Rng::new(42);
    for case in 0..300 {
        let full = random_solution(&mut rng);
        let mut p = full;
        let blanks = rng.below(65);
        let mut order: Vec<usize> = (0..81).collect();
        rng.shuffle(&mut order);
        for &c in &order[..blanks] {
            p.0[c] = 0;
        }
        let outs: Vec<_> = Algorithm::ALL.iter().map(|&a| run(&p, a, 2)).collect();
        for (a, out) in Algorithm::ALL.iter().zip(&outs) {
            assert_eq!(out.solutions, outs[3].solutions, "case {case} {a:?} on {p}");
            assert!(
                out.solutions >= 1,
                "case {case}: blanking keeps the original solution"
            );
            assert!(out.solution.unwrap().solves(&p), "case {case} {a:?}");
        }
    }
}

#[test]
fn property_random_givens_all_solvers_agree() {
    // Random consistent givens: some solvable, some not. Brute force can be slow on an
    // unsolvable sparse grid, so cases where any solver hits the limit are skipped.
    let mut rng = Rng::new(7);
    let (mut compared, mut unsolvable) = (0, 0);
    for case in 0..400 {
        let mut p = Grid::EMPTY;
        for _ in 0..rng.below(30) {
            let (c, d) = (rng.below(81), rng.below(9) as u8 + 1);
            let before = p.0[c];
            p.0[c] = d;
            if !p.conflicts().is_empty() {
                p.0[c] = before;
            }
        }
        let limited = Options {
            max_solutions: 2,
            node_limit: 2_000_000,
            ..Options::default()
        };
        let outs: Vec<_> = Algorithm::ALL
            .iter()
            .map(|&a| solve(&p, a, limited).unwrap())
            .collect();
        if outs.iter().any(|o| o.aborted) {
            continue;
        }
        compared += 1;
        unsolvable += u32::from(outs[0].solutions == 0);
        for (a, out) in Algorithm::ALL.iter().zip(&outs) {
            assert_eq!(out.solutions, outs[3].solutions, "case {case} {a:?} on {p}");
            if let Some(s) = out.solution {
                assert!(s.solves(&p), "case {case} {a:?}");
            }
        }
    }
    assert!(compared >= 350, "only {compared} cases compared");
    assert!(unsolvable > 0, "no unsolvable case was generated");
}

#[test]
fn property_parser_never_panics_and_round_trips() {
    let pool: Vec<char> = "123456789.0 \n\tx|-é\u{0}".chars().collect();
    let mut rng = Rng::new(9);
    for _ in 0..20_000 {
        let len = rng.below(100);
        let s: String = (0..len).map(|_| pool[rng.below(pool.len())]).collect();
        if let Ok(g) = Grid::parse(&s) {
            assert_eq!(Grid::parse(&g.to_string()), Ok(g));
        }
    }
}
