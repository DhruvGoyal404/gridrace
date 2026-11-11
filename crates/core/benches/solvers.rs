//! `cargo bench`: every solver on every corpus puzzle; median, p95 and max time per
//! solver, mean counters, and the hardest puzzles. A plain harness on purpose: it reports
//! percentiles over a puzzle set, which is the question here, with no dependencies.
//!
//! Each puzzle's time is the fastest of 3 to 5 runs (3 when a run takes over 50 ms), to keep
//! scheduler noise out. On a hybrid CPU, pin the run to one performance core (docs/BENCHMARKS.md).

use gridrace_core::{Algorithm, Grid, Options, Stats, solve};
use std::hint::black_box;
use std::path::Path;
use std::time::{Duration, Instant};

fn load(name: &str) -> Vec<Grid> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data")
        .join(name);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{}: {e}", path.display()))
        .lines()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
        .map(|l| Grid::parse(l.split('#').next().unwrap()).expect("corpus line parses"))
        .collect()
}

fn time(p: &Grid, a: Algorithm) -> (Duration, Stats) {
    let mut best = Duration::MAX;
    let mut stats = Stats::default();
    for run in 0..5 {
        let start = Instant::now();
        let out = black_box(solve(black_box(p), a, Options::default()).unwrap());
        let took = start.elapsed();
        assert!(out.solution.is_some());
        best = best.min(took);
        stats = out.stats;
        if run >= 2 && took > Duration::from_millis(50) {
            break;
        }
    }
    (best, stats)
}

fn pct(sorted: &[Duration], p: f64) -> Duration {
    // Nearest-rank percentile.
    let rank = ((p / 100.0) * sorted.len() as f64).ceil() as usize;
    sorted[rank.clamp(1, sorted.len()) - 1]
}

fn fmt(d: Duration) -> String {
    let us = d.as_secs_f64() * 1e6;
    if us >= 1000.0 {
        format!("{:.2} ms", us / 1000.0)
    } else {
        format!("{us:.1} µs")
    }
}

fn main() {
    for corpus in ["generated.txt", "adversarial.txt"] {
        let puzzles = load(corpus);
        let n = puzzles.len();
        println!("\n### {corpus} ({n} puzzles)\n");
        println!("| Solver | Median | p95 | Max | Mean nodes | Mean backtracks | Mean checks |");
        println!("|---|---:|---:|---:|---:|---:|---:|");
        let mut hardest = Vec::new();
        for a in Algorithm::ALL {
            let runs: Vec<(Duration, Stats, usize)> = puzzles
                .iter()
                .enumerate()
                .map(|(i, p)| {
                    let (d, s) = time(p, a);
                    (d, s, i)
                })
                .collect();
            let mut times: Vec<Duration> = runs.iter().map(|r| r.0).collect();
            times.sort();
            let mean = |f: fn(&Stats) -> u64| runs.iter().map(|r| f(&r.1)).sum::<u64>() / n as u64;
            println!(
                "| {} | {} | {} | {} | {} | {} | {} |",
                a.name(),
                fmt(pct(&times, 50.0)),
                fmt(pct(&times, 95.0)),
                fmt(times[n - 1]),
                mean(|s| s.nodes),
                mean(|s| s.backtracks),
                mean(|s| s.checks),
            );
            let worst = runs.iter().max_by_key(|r| r.0).unwrap();
            hardest.push((a, worst.2, worst.0, worst.1.nodes));
        }
        println!("\nHardest puzzle per solver:\n");
        for (a, i, d, nodes) in hardest {
            println!(
                "- {}: puzzle {i}, {}, {nodes} nodes: `{}`",
                a.name(),
                fmt(d),
                puzzles[i]
            );
        }
    }
}
