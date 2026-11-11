//! Naive backtracking: take the first empty cell, try 1 to 9, and check each digit by
//! scanning the cell's row, column and box (27 reads). Exponential in the worst case.

use crate::search::{Ctx, Step};
use crate::{Grid, box_of, col, row};

pub fn run(puzzle: &Grid, ctx: &mut Ctx) {
    let mut cells = puzzle.0;
    // Empty cells in reading order: "the first empty cell" without rescanning the grid.
    let empties: Vec<usize> = (0..81).filter(|&c| cells[c] == 0).collect();
    search(&mut cells, &empties, ctx);
}

fn legal(cells: &[u8; 81], cell: usize, d: u8) -> bool {
    let (r, c) = (row(cell), col(cell));
    let (br, bc) = (box_of(cell) / 3 * 3, box_of(cell) % 3 * 3);
    (0..9).all(|i| {
        cells[r * 9 + i] != d && cells[i * 9 + c] != d && cells[(br + i / 3) * 9 + bc + i % 3] != d
    })
}

/// True when the search should stop (enough solutions, or the node limit).
fn search(cells: &mut [u8; 81], empties: &[usize], ctx: &mut Ctx) -> bool {
    let Some((&cell, rest)) = empties.split_first() else {
        return ctx.found(cells);
    };
    for d in 1..=9 {
        ctx.stats.checks += 1;
        if !legal(cells, cell, d) {
            continue;
        }
        if !ctx.node() {
            return true;
        }
        cells[cell] = d;
        ctx.event(cell, d, Step::Guess);
        if search(cells, rest, ctx) {
            return true;
        }
        cells[cell] = 0;
        ctx.stats.backtracks += 1;
        ctx.event(cell, d, Step::Undo);
    }
    false
}
