//! Puzzles with exactly one solution. Fill a random grid, then visit the cells in random
//! order and empty each one only if the puzzle still has a single solution (counting
//! stops at 2). Every clue left is necessary, so the result is minimal.

use crate::human::{Difficulty, Grade, grade};
use crate::rng::Rng;
use crate::{Grid, count_solutions};

/// A random complete grid, by backtracking with a shuffled digit order per cell.
/// shortcut: not uniform over all 6.67e21 grids; fine for puzzles, not for statistics.
pub fn random_solution(rng: &mut Rng) -> Grid {
    fn fill(cells: &mut [u8; 81], at: usize, rng: &mut Rng) -> bool {
        if at == 81 {
            return true;
        }
        let mut order = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        rng.shuffle(&mut order);
        for d in order {
            cells[at] = d;
            if (0..at).all(|p| cells[p] != d || !crate::are_peers(p, at))
                && fill(cells, at + 1, rng)
            {
                return true;
            }
        }
        cells[at] = 0;
        false
    }
    let mut cells = [0; 81];
    assert!(
        fill(&mut cells, 0, rng),
        "an empty grid always has a solution"
    );
    Grid(cells)
}

/// A minimal puzzle with a unique solution, fully determined by `seed`.
pub fn minimal_puzzle(seed: u64) -> (Grid, Grid) {
    let mut rng = Rng::new(seed);
    let solution = random_solution(&mut rng);
    (minimize(solution, &mut rng), solution)
}

/// Empties clues in random order while the puzzle keeps exactly one solution. The result
/// is minimal: removing any remaining clue allows a second solution.
pub fn minimize(mut puzzle: Grid, rng: &mut Rng) -> Grid {
    let mut order: [usize; 81] = std::array::from_fn(|i| i);
    rng.shuffle(&mut order);
    for cell in order {
        let digit = puzzle.0[cell];
        if digit == 0 {
            continue;
        }
        puzzle.0[cell] = 0;
        if count_solutions(&puzzle, 2) != Some(1) {
            puzzle.0[cell] = digit;
        }
    }
    puzzle
}

/// A generated puzzle and what it is: `minimal_puzzle(seed)`, graded.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Generated {
    pub seed: u64,
    pub puzzle: Grid,
    pub solution: Grid,
    pub grade: Grade,
}

/// The first puzzle graded `difficulty` among seeds `seed, seed + 1, ...`, trying at most
/// `attempts`. The result carries its own seed, so a puzzle can be shared as one number.
pub fn puzzle_of(difficulty: Difficulty, seed: u64, attempts: u32) -> Option<Generated> {
    (0..u64::from(attempts)).find_map(|i| {
        let seed = seed.wrapping_add(i);
        let (puzzle, solution) = minimal_puzzle(seed);
        let grade = grade(&puzzle);
        (grade.difficulty == difficulty).then_some(Generated {
            seed,
            puzzle,
            solution,
            grade,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn puzzles_are_unique_minimal_and_reproducible() {
        for seed in 0..5 {
            let (puzzle, solution) = minimal_puzzle(seed);
            assert!(solution.solves(&puzzle));
            assert_eq!(count_solutions(&puzzle, 2), Some(1));
            for cell in (0..81).filter(|&c| puzzle.0[c] != 0) {
                let mut fewer = puzzle;
                fewer.0[cell] = 0;
                assert_eq!(
                    count_solutions(&fewer, 2),
                    Some(2),
                    "clue {cell} is redundant"
                );
            }
            assert_eq!(minimal_puzzle(seed), (puzzle, solution));
        }
    }
}
