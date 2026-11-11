//! Any input: parsing never panics, a parsed grid round-trips, and every solver handles it
//! without panicking and agrees with the others on the solution count.
#![no_main]

use gridrace_core::{Algorithm, Grid, Options, solve};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Ok(text) = std::str::from_utf8(data) else {
        return;
    };
    let Ok(grid) = Grid::parse(text) else {
        return;
    };
    assert_eq!(Grid::parse(&grid.to_string()), Ok(grid));
    // The limit keeps each input fast; brute force can need millions of nodes.
    let opts = Options {
        max_solutions: 2,
        node_limit: 20_000,
        trace_cap: 64,
    };
    let Ok(dlx) = solve(&grid, Algorithm::Dlx, opts) else {
        assert!(!grid.conflicts().is_empty());
        return;
    };
    for a in Algorithm::ALL {
        let out = solve(&grid, a, opts).expect("same givens, same validity");
        assert!(out.trace.events.len() <= 64);
        if let Some(s) = out.solution {
            assert!(s.solves(&grid), "{a:?}");
        }
        if !out.aborted && !dlx.aborted {
            assert_eq!(out.solutions, dlx.solutions, "{a:?}");
        }
    }
});
