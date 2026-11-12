//! The browser's view of `gridrace-core`. Every function takes and returns plain values:
//! puzzles as 81-character strings, results as JSON strings, traces as bytes. Nothing here
//! times anything: `std::time` doesn't exist on `wasm32-unknown-unknown`, so the worker
//! measures with `performance.now()` around [`solve_repeat`].
//!
//! Input comes from users (pasted puzzles, URLs), so every entry point validates and
//! returns `{"error": ...}` instead of panicking.

use gridrace_core::generate::puzzle_of;
use gridrace_core::human::{self, Difficulty, Hint, Step};
use gridrace_core::{Algorithm, Grid, Options, Step as TraceStep, count_solutions, solve};
use serde::Serialize;
use wasm_bindgen::prelude::wasm_bindgen;

fn json(value: &impl Serialize) -> String {
    serde_json::to_string(value).expect("plain data always serializes")
}

fn error(message: impl Into<String>) -> String {
    #[derive(Serialize)]
    struct E {
        error: String,
    }
    json(&E {
        error: message.into(),
    })
}

fn algorithm(index: u8) -> Option<Algorithm> {
    Algorithm::ALL.get(index as usize).copied()
}

/// A puzzle the caller sent: parsed, and checked for clashing digits.
fn puzzle(text: &str) -> Result<Grid, String> {
    let grid = Grid::parse(text).map_err(|e| e.to_string())?;
    match grid.conflicts().first() {
        None => Ok(grid),
        Some(&(a, b)) => Err(format!(
            "{} and {} both hold {}",
            human::cell_name(a as usize),
            human::cell_name(b as usize),
            grid.0[a as usize]
        )),
    }
}

#[derive(Serialize)]
struct Analysis {
    puzzle: String,
    givens: usize,
    /// Clashing pairs of cells; empty when the givens are consistent.
    conflicts: Vec<(u8, u8)>,
    /// 0, 1, or 2 meaning "two or more".
    solutions: u32,
    solution: Option<String>,
    difficulty: Option<&'static str>,
    hardest: Option<&'static str>,
}

/// Parses and checks a pasted puzzle: clashes, solution count (to 2), and, when unique,
/// the solution and its grade. Errors name the problem in words.
#[wasm_bindgen]
pub fn analyze(text: &str) -> String {
    let grid = match Grid::parse(text) {
        Ok(g) => g,
        Err(e) => return error(e.to_string()),
    };
    let conflicts = grid.conflicts();
    let (solutions, solution) = if conflicts.is_empty() {
        let opts = Options {
            max_solutions: 2,
            ..Options::default()
        };
        let out = solve(&grid, Algorithm::Dlx, opts).expect("no conflicts");
        (out.solutions, out.solution)
    } else {
        (0, None)
    };
    let grade = (solutions == 1).then(|| human::grade(&grid));
    json(&Analysis {
        puzzle: grid.to_string(),
        givens: grid.givens(),
        conflicts,
        solutions,
        solution: (solutions == 1)
            .then(|| solution.map(|s| s.to_string()))
            .flatten(),
        difficulty: grade.as_ref().map(|g| g.difficulty.name()),
        hardest: grade.and_then(|g| g.hardest.map(human::Technique::name)),
    })
}

#[derive(Serialize)]
struct Counters {
    nodes: u64,
    backtracks: u64,
    checks: u64,
}

#[derive(Serialize)]
struct Solved {
    algorithm: &'static str,
    solutions: u32,
    aborted: bool,
    solution: Option<String>,
    stats: Counters,
    trace_events: usize,
    trace_capped: bool,
}

/// One solver run: the result as JSON, and the trace as bytes, three per event
/// (cell, digit, kind: 0 guess, 1 forced, 2 undo).
#[wasm_bindgen(getter_with_clone)]
pub struct SolveOut {
    pub json: String,
    pub trace: Vec<u8>,
}

#[wasm_bindgen]
pub fn solve_traced(text: &str, algo: u8, node_limit: f64, trace_cap: u32) -> SolveOut {
    let run = || -> Result<SolveOut, String> {
        let grid = puzzle(text)?;
        let a = algorithm(algo).ok_or("unknown algorithm")?;
        let opts = Options {
            max_solutions: 1,
            node_limit: limit(node_limit),
            trace_cap: trace_cap as usize,
        };
        let out = solve(&grid, a, opts).map_err(|_| "the givens clash")?;
        let trace = out
            .trace
            .events
            .iter()
            .flat_map(|e| {
                let kind = match e.step {
                    TraceStep::Guess => 0,
                    TraceStep::Forced => 1,
                    TraceStep::Undo => 2,
                };
                [e.cell, e.digit, kind]
            })
            .collect();
        Ok(SolveOut {
            json: json(&Solved {
                algorithm: a.name(),
                solutions: out.solutions,
                aborted: out.aborted,
                solution: out.solution.map(|s| s.to_string()),
                stats: Counters {
                    nodes: out.stats.nodes,
                    backtracks: out.stats.backtracks,
                    checks: out.stats.checks,
                },
                trace_events: out.trace.events.len(),
                trace_capped: out.trace.capped,
            }),
            trace,
        })
    };
    run().unwrap_or_else(|e| SolveOut {
        json: error(e),
        trace: Vec::new(),
    })
}

/// Solves `reps` times without a trace, for timing; returns the last run's nodes, or -1 on
/// bad input. The worker times the whole call and divides by `reps`.
#[wasm_bindgen]
pub fn solve_repeat(text: &str, algo: u8, node_limit: f64, reps: u32) -> f64 {
    let (Ok(grid), Some(a)) = (puzzle(text), algorithm(algo)) else {
        return -1.0;
    };
    let opts = Options {
        node_limit: limit(node_limit),
        ..Options::default()
    };
    let mut nodes = 0;
    for _ in 0..reps.max(1) {
        nodes = solve(std::hint::black_box(&grid), a, opts).map_or(0, |o| o.stats.nodes);
    }
    nodes as f64
}

/// JS numbers are f64; anything not a positive finite number means "no limit".
fn limit(n: f64) -> u64 {
    if n.is_finite() && n >= 1.0 {
        n as u64
    } else {
        u64::MAX
    }
}

#[derive(Serialize)]
struct Generated {
    seed: u64,
    puzzle: String,
    solution: String,
    difficulty: &'static str,
    hardest: Option<&'static str>,
}

/// A puzzle of the given tier (0 Easy .. 5 Beyond) from seeds `seed, seed + 1, ...`.
#[wasm_bindgen]
pub fn generate(tier: u8, seed: u32, attempts: u32) -> String {
    let Some(&difficulty) = Difficulty::ALL.get(tier as usize) else {
        return error("unknown difficulty");
    };
    match puzzle_of(difficulty, u64::from(seed), attempts) {
        Some(g) => json(&Generated {
            seed: g.seed,
            puzzle: g.puzzle.to_string(),
            solution: g.solution.to_string(),
            difficulty: g.grade.difficulty.name(),
            hardest: g.grade.hardest.map(human::Technique::name),
        }),
        None => error(format!(
            "no {} puzzle in {attempts} attempts",
            difficulty.name()
        )),
    }
}

#[derive(Serialize)]
struct StepJson {
    technique: &'static str,
    rating: &'static str,
    difficulty: &'static str,
    place: Option<(u8, u8)>,
    eliminate: Vec<(u8, u8)>,
    cells: Vec<u8>,
    digits: Vec<u8>,
    unit: Option<String>,
    explanation: String,
}

impl From<&Step> for StepJson {
    fn from(s: &Step) -> Self {
        StepJson {
            technique: s.technique.name(),
            rating: s.technique.rating(),
            difficulty: s.technique.difficulty().name(),
            place: s.place,
            eliminate: s.eliminate.clone(),
            cells: s.cells.clone(),
            digits: (1..=9).filter(|d| s.digits & (1 << (d - 1)) != 0).collect(),
            unit: s.unit.map(|u| human::unit_name(u as usize)),
            explanation: s.explanation.clone(),
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum HintJson {
    Conflict {
        pairs: Vec<(u8, u8)>,
    },
    NotUnique {
        solutions: u32,
    },
    Mistakes {
        cells: Vec<u8>,
    },
    Solved,
    Steps {
        steps: Vec<StepJson>,
    },
    Reveal {
        cell: u8,
        digit: u8,
        candidates: Vec<u8>,
    },
}

/// The next hint for a player: `givens` is the puzzle, `current` the board as it stands.
#[wasm_bindgen]
pub fn hint(givens: &str, current: &str) -> String {
    let (g, c) = match (Grid::parse(givens), Grid::parse(current)) {
        (Ok(g), Ok(c)) => (g, c),
        (Err(e), _) | (_, Err(e)) => return error(e.to_string()),
    };
    if (0..81).any(|i| g.0[i] != 0 && g.0[i] != c.0[i]) {
        return error("the board changed a given");
    }
    json(&match human::hint(&g, &c) {
        Hint::Conflict { pairs } => HintJson::Conflict { pairs },
        Hint::NotUnique { solutions } => HintJson::NotUnique { solutions },
        Hint::Mistakes { cells } => HintJson::Mistakes { cells },
        Hint::Solved => HintJson::Solved,
        Hint::Steps(steps) => HintJson::Steps {
            steps: steps.iter().map(StepJson::from).collect(),
        },
        Hint::Reveal {
            cell,
            digit,
            candidates,
        } => HintJson::Reveal {
            cell,
            digit,
            candidates: (1..=9)
                .filter(|d| candidates & (1 << (d - 1)) != 0)
                .collect(),
        },
    })
}

/// Solutions up to 2 (2 means "two or more"), or -1 for a puzzle that doesn't parse or clashes.
#[wasm_bindgen]
pub fn count(text: &str) -> i32 {
    puzzle(text)
        .ok()
        .and_then(|g| count_solutions(&g, 2))
        .map_or(-1, |n| i32::try_from(n).unwrap_or(2))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLASSIC: &str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

    #[test]
    fn analyze_reports_problems_in_words() {
        assert!(analyze("12x").contains("\"error\":\"character 'x' at position 3"));
        let clash = format!("55{}", ".".repeat(79));
        let a: serde_json::Value = serde_json::from_str(&analyze(&clash)).unwrap();
        assert_eq!(a["conflicts"], serde_json::json!([[0, 1]]));
        assert_eq!(a["solutions"], 0);
        let a: serde_json::Value = serde_json::from_str(&analyze(CLASSIC)).unwrap();
        assert_eq!(
            (a["solutions"].as_u64(), a["difficulty"].as_str()),
            (Some(1), Some("Easy"))
        );
        let a: serde_json::Value = serde_json::from_str(&analyze(&".".repeat(81))).unwrap();
        assert_eq!(a["solutions"], 2);
        assert!(a["solution"].is_null());
    }

    #[test]
    fn traces_are_three_bytes_per_event_and_say_when_capped() {
        let out = solve_traced(CLASSIC, 0, 0.0, 10);
        let v: serde_json::Value = serde_json::from_str(&out.json).unwrap();
        assert_eq!(out.trace.len(), 30);
        assert_eq!(v["trace_capped"], true);
        assert_eq!(v["algorithm"], "brute");
        assert!(
            out.trace
                .chunks(3)
                .all(|e| e[0] < 81 && (1..=9).contains(&e[1]) && e[2] <= 2)
        );
        assert!(
            solve_traced(CLASSIC, 9, 0.0, 0)
                .json
                .contains("unknown algorithm")
        );
        let limited: serde_json::Value =
            serde_json::from_str(&solve_traced(CLASSIC, 0, 5.0, 0).json).unwrap();
        assert_eq!(limited["aborted"], true);
    }

    #[test]
    fn repeat_returns_nodes_or_minus_one() {
        assert!(solve_repeat(CLASSIC, 2, 0.0, 3) >= 51.0);
        assert!(solve_repeat("bad", 2, 0.0, 3) < 0.0);
    }

    #[test]
    fn generate_and_hint_round_trip() {
        let g: serde_json::Value = serde_json::from_str(&generate(1, 7, 500)).unwrap();
        assert_eq!(g["difficulty"], "Medium");
        let p = g["puzzle"].as_str().unwrap();
        let h: serde_json::Value = serde_json::from_str(&hint(p, p)).unwrap();
        assert_eq!(h["kind"], "steps");
        let last = h["steps"].as_array().unwrap().last().unwrap();
        let (cell, digit) = (
            last["place"][0].as_u64().unwrap(),
            last["place"][1].as_u64().unwrap(),
        );
        let solution = g["solution"].as_str().unwrap().as_bytes();
        assert_eq!(u64::from(solution[cell as usize] - b'0'), digit);
        assert!(hint(p, &".".repeat(81)).contains("changed a given"));
        assert!(generate(9, 0, 1).contains("unknown difficulty"));
        assert_eq!(count(&".".repeat(81)), 2);
    }
}
