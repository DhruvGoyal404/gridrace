//! The human-style solver: one hand-built board per technique, then seeded properties over
//! generated puzzles (every step is sound, hints lead to the solution, grades are stable).

use gridrace_core::generate::{minimal_puzzle, puzzle_of};
use gridrace_core::human::{
    Board, Difficulty, Hint, Step, Technique, grade, hint, solve_logically,
};
use gridrace_core::{Grid, UNITS};

const CLASSIC: &str =
    "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

/// An empty board where every cell can still be anything: patterns are carved into it.
fn open_board() -> Board {
    Board {
        cells: [0; 81],
        cands: [0x1FF; 81],
    }
}

const fn bit(d: u8) -> u16 {
    1 << (d - 1)
}

/// Cell index from 1-based row and column, as written in explanations.
const fn rc(r: usize, c: usize) -> u8 {
    ((r - 1) * 9 + c - 1) as u8
}

fn remove(b: &mut Board, cells: impl IntoIterator<Item = u8>, d: u8) {
    for c in cells {
        b.cands[c as usize] &= !bit(d);
    }
}

fn elims(step: &Step) -> Vec<(u8, u8)> {
    let mut e = step.eliminate.clone();
    e.sort_unstable();
    e
}

#[test]
fn hidden_single_names_the_box_and_the_digit() {
    // 5s outside box 1 block rows 1 and 3 and columns 1 and 3, leaving only r2c2.
    let mut g = Grid::EMPTY;
    for cell in [rc(1, 4), rc(3, 5), rc(4, 1), rc(7, 3)] {
        g.0[cell as usize] = 5;
    }
    let step = Board::new(&g).find(Technique::HiddenSingle).unwrap();
    assert_eq!(step.place, Some((rc(2, 2), 5)));
    assert_eq!(step.unit, Some(18));
    assert_eq!(
        step.explanation,
        "Hidden single: in box 1, 5 fits only in r2c2. No other cell of the box can hold a 5."
    );
}

#[test]
fn naked_single_from_peers() {
    let mut g = Grid::EMPTY;
    for (c, d) in [
        (1, 1),
        (2, 2),
        (3, 3),
        (4, 4),
        (5, 5),
        (6, 6),
        (7, 7),
        (8, 8),
    ] {
        g.0[c] = d; // r1c2..r1c9 hold 1..8
    }
    let step = Board::new(&g).find(Technique::NakedSingle).unwrap();
    assert_eq!(step.place, Some((rc(1, 1), 9)));
    assert!(
        step.explanation
            .contains("already in its row, column or box")
    );
}

#[test]
fn pointing_removes_the_digit_from_the_rest_of_the_line() {
    let mut b = open_board();
    // In box 1, 1 fits only in r1c1 and r1c2.
    remove(&mut b, UNITS[18].iter().copied().filter(|&c| c > 1), 1);
    let step = b.find(Technique::Pointing).unwrap();
    assert_eq!(step.cells, vec![rc(1, 1), rc(1, 2)]);
    assert_eq!(
        elims(&step),
        (4..=9).map(|c| (rc(1, c), 1)).collect::<Vec<_>>()
    );
    assert!(
        step.explanation
            .starts_with("Pointing pair: in box 1, 1 can only go in r1c1 and r1c2, all on row 1.")
    );
}

#[test]
fn box_line_reduction_removes_the_digit_from_the_rest_of_the_box() {
    let mut b = open_board();
    // In row 1, 1 fits only in r1c1 and r1c2 (box 1).
    remove(&mut b, (3..=9).map(|c| rc(1, c)), 1);
    let step = b.find(Technique::BoxLineReduction).unwrap();
    let mut expected: Vec<(u8, u8)> = [2, 3]
        .iter()
        .flat_map(|&r| (1..=3).map(move |c| (rc(r, c), 1)))
        .collect();
    expected.sort_unstable();
    assert_eq!(elims(&step), expected);
}

#[test]
fn naked_pair_and_triple() {
    let mut b = open_board();
    b.cands[rc(1, 1) as usize] = bit(1) | bit(2);
    b.cands[rc(1, 2) as usize] = bit(1) | bit(2);
    let step = b.find(Technique::NakedPair).unwrap();
    assert_eq!(step.unit, Some(0), "row 1 is checked before box 1");
    assert_eq!(step.digits, bit(1) | bit(2));
    assert_eq!(step.eliminate.len(), 14, "1 and 2 from r1c3..r1c9");

    let mut b = open_board();
    b.cands[rc(1, 1) as usize] = bit(1) | bit(2);
    b.cands[rc(1, 2) as usize] = bit(2) | bit(3);
    b.cands[rc(1, 3) as usize] = bit(1) | bit(3);
    assert_eq!(b.find(Technique::NakedPair), None);
    let step = b.find(Technique::NakedTriple).unwrap();
    assert_eq!(step.cells, vec![rc(1, 1), rc(1, 2), rc(1, 3)]);
    assert_eq!(step.eliminate.len(), 18, "1, 2 and 3 from r1c4..r1c9");
}

#[test]
fn hidden_pair_and_triple() {
    let mut b = open_board();
    for d in [1, 2] {
        remove(&mut b, (3..=9).map(|c| rc(1, c)), d);
    }
    let step = b.find(Technique::HiddenPair).unwrap();
    assert_eq!(step.cells, vec![rc(1, 1), rc(1, 2)]);
    assert_eq!(step.eliminate.len(), 14, "3 to 9 from both cells");
    assert!(step.eliminate.iter().all(|&(_, d)| d >= 3));

    let mut b = open_board();
    for d in [1, 2, 3] {
        remove(&mut b, (4..=9).map(|c| rc(1, c)), d);
    }
    assert_eq!(b.find(Technique::HiddenPair), None);
    let step = b.find(Technique::HiddenTriple).unwrap();
    assert_eq!(step.cells, vec![rc(1, 1), rc(1, 2), rc(1, 3)]);
    assert_eq!(step.eliminate.len(), 18, "4 to 9 from three cells");
}

#[test]
fn x_wing_and_swordfish() {
    let mut b = open_board();
    // 5 in rows 1 and 5 fits only in columns 2 and 7.
    for r in [1, 5] {
        remove(
            &mut b,
            (1..=9).filter(|c| ![2, 7].contains(c)).map(|c| rc(r, c)),
            5,
        );
    }
    let step = b.find(Technique::XWing).unwrap();
    assert_eq!(step.cells, vec![rc(1, 2), rc(1, 7), rc(5, 2), rc(5, 7)]);
    assert_eq!(
        step.eliminate.len(),
        14,
        "5 from columns 2 and 7 in the other 7 rows"
    );
    assert!(
        step.explanation
            .starts_with("X-Wing: in row 1, row 5, 5 fits only within the same 2 columns.")
    );

    let mut b = open_board();
    // Rows 1, 4, 7: 5 only in columns {1,5}, {5,9}, {1,9}.
    for (r, cols) in [(1, [1, 5]), (4, [5, 9]), (7, [1, 9])] {
        remove(
            &mut b,
            (1..=9).filter(|c| !cols.contains(c)).map(|c| rc(r, c)),
            5,
        );
    }
    assert_eq!(b.find(Technique::XWing), None);
    let step = b.find(Technique::Swordfish).unwrap();
    assert_eq!(step.cells.len(), 6);
    assert_eq!(
        step.eliminate.len(),
        18,
        "5 from columns 1, 5, 9 in the other 6 rows"
    );
}

#[test]
fn xy_wing_removes_z_from_cells_seeing_both_pincers() {
    let mut b = open_board();
    b.cands[rc(1, 1) as usize] = bit(1) | bit(2); // pivot
    b.cands[rc(1, 5) as usize] = bit(1) | bit(3); // pincer in the pivot's row
    b.cands[rc(5, 1) as usize] = bit(2) | bit(3); // pincer in the pivot's column
    let step = b.find(Technique::XYWing).unwrap();
    assert_eq!(step.eliminate, vec![(rc(5, 5), 3)]);
    assert_eq!(
        step.explanation,
        "XY-Wing: r1c1 is 1 or 2. If 1, r1c5 must be 3; if 2, r5c1 must be 3. Either way one of them is 3, so it removes 3 from r5c5."
    );
}

#[test]
fn the_classic_is_easy() {
    let p = Grid::parse(CLASSIC).unwrap();
    let g = grade(&p);
    assert_eq!(g.difficulty, Difficulty::Easy);
    assert_eq!(g.steps, 51);
    assert!(solve_logically(&p).solved);
}

/// Every placement agrees with the solution and no elimination removes the solution digit.
fn assert_sound(steps: &[Step], solution: &Grid, ctx: &str) {
    for s in steps {
        if let Some((c, d)) = s.place {
            assert_eq!(solution.0[c as usize], d, "{ctx}: {}", s.explanation);
        }
        for &(c, d) in &s.eliminate {
            assert_ne!(solution.0[c as usize], d, "{ctx}: {}", s.explanation);
        }
        assert!(
            s.place.is_some() || !s.eliminate.is_empty(),
            "{ctx}: a step that does nothing"
        );
    }
}

#[test]
fn property_every_step_is_sound_and_every_technique_occurs() {
    let mut used = [0u32; 11];
    let mut tiers = [0u32; 5];
    for seed in 0..400 {
        let (p, solution) = minimal_puzzle(seed);
        let logical = solve_logically(&p);
        assert_sound(&logical.steps, &solution, &format!("seed {seed}"));
        if logical.solved {
            assert_eq!(Grid(logical.board.cells), solution, "seed {seed}");
        }
        let g = grade(&p);
        assert_eq!(
            g.difficulty == Difficulty::Beyond,
            !logical.solved,
            "seed {seed}"
        );
        tiers[g.difficulty as usize] += 1;
        for (u, n) in used.iter_mut().zip(g.uses) {
            *u += n;
        }
    }
    eprintln!("tiers {tiers:?}, uses {used:?}");
    for t in Technique::ALL {
        assert!(used[t as usize] > 0, "{t:?} never used in 400 puzzles");
    }
}

#[test]
fn property_hints_lead_to_the_solution() {
    for seed in 0..60 {
        let (p, solution) = minimal_puzzle(seed);
        let mut current = p;
        let mut reveals = 0;
        for _ in 0..81 {
            match hint(&p, &current) {
                Hint::Solved => break,
                Hint::Steps(steps) => {
                    assert_sound(&steps, &solution, &format!("seed {seed}"));
                    let (cell, d) = steps.last().unwrap().place.unwrap();
                    assert!(steps[..steps.len() - 1].iter().all(|s| s.place.is_none()));
                    current.0[cell as usize] = d;
                }
                Hint::Reveal {
                    cell,
                    digit,
                    candidates,
                } => {
                    assert_eq!(digit, solution.0[cell as usize]);
                    assert!(
                        candidates & bit(digit) != 0,
                        "the revealed digit is a candidate"
                    );
                    current.0[cell as usize] = digit;
                    reveals += 1;
                }
                other => panic!("seed {seed}: unexpected {other:?}"),
            }
        }
        assert_eq!(current, solution, "seed {seed}");
        assert_eq!(
            reveals > 0,
            grade(&p).difficulty == Difficulty::Beyond,
            "seed {seed}"
        );
    }
}

#[test]
fn hint_chains_keep_only_needed_steps() {
    // Find a hint that needs eliminations first, then check none can be dropped.
    let found = (0..400).find_map(|seed| {
        let (p, _) = minimal_puzzle(seed);
        let mut current = p;
        for _ in 0..81 {
            match hint(&p, &current) {
                Hint::Steps(steps) if steps.len() > 1 => return Some((current, steps)),
                Hint::Steps(steps) => {
                    let (c, d) = steps[0].place.unwrap();
                    current.0[c as usize] = d;
                }
                _ => return None,
            }
        }
        None
    });
    let (current, steps) = found.expect("some puzzle needs an elimination before a placement");
    let (cell, d) = steps.last().unwrap().place.unwrap();
    for skip in 0..steps.len() - 1 {
        let mut b = Board::new(&current);
        for (i, s) in steps[..steps.len() - 1].iter().enumerate() {
            if i != skip {
                b.apply(s);
            }
        }
        let last = steps.last().unwrap();
        let still = match last.unit {
            Some(u) => UNITS[u as usize]
                .iter()
                .filter(|&&c| b.cands[c as usize] & bit(d) != 0)
                .eq([cell].iter()),
            None => b.cands[cell as usize] == bit(d),
        };
        assert!(!still, "step {skip} wasn't needed:\n{steps:#?}");
    }
}

#[test]
fn hints_report_problems_before_steps() {
    let p = Grid::parse(CLASSIC).unwrap();
    let solution = gridrace_core::solve(
        &p,
        gridrace_core::Algorithm::Dlx,
        gridrace_core::Options::default(),
    )
    .unwrap()
    .solution
    .unwrap();

    let mut wrong = p;
    let empty = (0..81).find(|&c| p.0[c] == 0).unwrap();
    wrong.0[empty] = solution.0[empty] % 9 + 1;
    if wrong.conflicts().is_empty() {
        assert_eq!(
            hint(&p, &wrong),
            Hint::Mistakes {
                cells: vec![empty as u8]
            }
        );
    }

    let mut clash = p;
    clash.0[2] = 5; // r1c1 already holds 5
    assert!(matches!(hint(&p, &clash), Hint::Conflict { .. }));

    assert_eq!(
        hint(&Grid::EMPTY, &Grid::EMPTY),
        Hint::NotUnique { solutions: 2 }
    );
    assert_eq!(hint(&p, &solution), Hint::Solved);
}

#[test]
fn the_generator_hits_each_tier() {
    for d in Difficulty::ALL {
        let g = puzzle_of(d, 0, 2000).unwrap_or_else(|| panic!("no {d:?} puzzle in 2000 seeds"));
        assert_eq!(g.grade.difficulty, d);
        assert_eq!(gridrace_core::count_solutions(&g.puzzle, 2), Some(1));
        assert_eq!(
            minimal_puzzle(g.seed),
            (g.puzzle, g.solution),
            "the seed reproduces it"
        );
    }
}
