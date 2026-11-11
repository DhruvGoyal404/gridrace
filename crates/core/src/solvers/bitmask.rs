//! The brute-force search with O(1) legality: one 9-bit mask per row, column and box,
//! and `!(row | col | box)` gives every legal digit at once. Same order, same tree,
//! same node count as `brute`; only the cost of a check changes.

use super::{Masks, digits};
use crate::Grid;
use crate::search::{Ctx, Step};

pub fn run(puzzle: &Grid, ctx: &mut Ctx) {
    let mut cells = puzzle.0;
    let mut masks = Masks::of(&cells);
    let empties: Vec<usize> = (0..81).filter(|&c| cells[c] == 0).collect();
    search(&mut cells, &mut masks, &empties, ctx);
}

fn search(cells: &mut [u8; 81], masks: &mut Masks, empties: &[usize], ctx: &mut Ctx) -> bool {
    let Some((&cell, rest)) = empties.split_first() else {
        return ctx.found(cells);
    };
    ctx.stats.checks += 1;
    for d in digits(masks.free(cell)) {
        if !ctx.node() {
            return true;
        }
        cells[cell] = d;
        masks.toggle(cell, d);
        ctx.event(cell, d, Step::Guess);
        if search(cells, masks, rest, ctx) {
            return true;
        }
        masks.toggle(cell, d);
        cells[cell] = 0;
        ctx.stats.backtracks += 1;
        ctx.event(cell, d, Step::Undo);
    }
    false
}
