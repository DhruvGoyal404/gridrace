//! `cargo bench`: every solver on every corpus puzzle. Reports median, p95 and max time
//! per solver, mean counters, and the hardest puzzle, for each difficulty tier of
//! graded.txt, then for hardest.txt and adversarial.txt. A plain harness on purpose: it
//! reports percentiles over a puzzle set, which is the question here, with no dependencies.
//!
//! Each puzzle's time is the fastest of 3 to 5 runs (3 when a run takes over 50 ms), to keep
//! scheduler noise out. On a hybrid CPU, run it through scripts/bench.ps1 (docs/BENCHMARKS.md).

use gridrace_core::human::{Difficulty, grade};
use gridrace_core::{Algorithm, Grid, Options, Stats, solve};
use std::hint::black_box;
use std::path::Path;
use std::time::{Duration, Instant};

/// Brute force and bitmask give up here and count as aborted; the time is then a lower bound.
const NODE_LIMIT: u64 = 100_000_000;

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

struct Run {
    time: Duration,
    stats: Stats,
    aborted: bool,
}

fn time(p: &Grid, a: Algorithm) -> Run {
    let opts = Options {
        node_limit: NODE_LIMIT,
        ..Options::default()
    };
    let mut best = Duration::MAX;
    let mut last = None;
    for run in 0..5 {
        let start = Instant::now();
        let out = black_box(solve(black_box(p), a, opts).unwrap());
        let took = start.elapsed();
        assert!(out.aborted || out.solution.is_some());
        best = best.min(took);
        last = Some(out);
        if run >= 2 && took > Duration::from_millis(50) {
            break;
        }
    }
    let out = last.unwrap();
    Run {
        time: best,
        stats: out.stats,
        aborted: out.aborted,
    }
}

fn pct(sorted: &[Duration], p: f64) -> Duration {
    // Nearest-rank percentile.
    let rank = ((p / 100.0) * sorted.len() as f64).ceil() as usize;
    sorted[rank.clamp(1, sorted.len()) - 1]
}

fn fmt(d: Duration) -> String {
    let us = d.as_secs_f64() * 1e6;
    if us >= 1e6 {
        format!("{:.2} s", us / 1e6)
    } else if us >= 1000.0 {
        format!("{:.2} ms", us / 1000.0)
    } else {
        format!("{us:.1} µs")
    }
}

/// One table row per solver, then each solver's hardest puzzle.
fn report(title: &str, puzzles: &[Grid]) {
    let n = puzzles.len();
    println!("\n### {title} ({n} puzzles)\n");
    println!(
        "| Solver | Median | p95 | Max | Mean nodes | Mean backtracks | Mean checks | Aborted |"
    );
    println!("|---|---:|---:|---:|---:|---:|---:|---:|");
    let mut hardest = Vec::new();
    for a in Algorithm::ALL {
        let runs: Vec<Run> = puzzles.iter().map(|p| time(p, a)).collect();
        let mut times: Vec<Duration> = runs.iter().map(|r| r.time).collect();
        times.sort();
        let mean = |f: fn(&Stats) -> u64| runs.iter().map(|r| f(&r.stats)).sum::<u64>() / n as u64;
        println!(
            "| {} | {} | {} | {} | {} | {} | {} | {} |",
            a.name(),
            fmt(pct(&times, 50.0)),
            fmt(pct(&times, 95.0)),
            fmt(times[n - 1]),
            mean(|s| s.nodes),
            mean(|s| s.backtracks),
            mean(|s| s.checks),
            runs.iter().filter(|r| r.aborted).count(),
        );
        let (i, worst) = runs.iter().enumerate().max_by_key(|(_, r)| r.time).unwrap();
        hardest.push((a, i, worst.time, worst.stats.nodes));
    }
    println!("\nHardest puzzle per solver:\n");
    for (a, i, d, nodes) in hardest {
        println!(
            "- {}: #{i}, {}, {nodes} nodes: `{}`",
            a.name(),
            fmt(d),
            puzzles[i]
        );
    }
}

fn main() {
    let graded = load("graded.txt");
    for tier in Difficulty::ALL {
        // Graded here, not read from the file's comments: the table is about what the code says.
        let of_tier: Vec<Grid> = graded
            .iter()
            .copied()
            .filter(|p| grade(p).difficulty == tier)
            .collect();
        report(&format!("graded.txt, {}", tier.name()), &of_tier);
    }
    report("hardest.txt", &load("hardest.txt"));
    report("adversarial.txt", &load("adversarial.txt"));
}
