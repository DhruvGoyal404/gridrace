//! Constraint propagation plus the minimum-remaining-values heuristic. After every guess,
//! place naked singles (a cell with one candidate) and hidden singles (a digit with one
//! place in a unit) until nothing changes, then branch on the cell with fewest candidates.
//! Each branch works on a copy of the 135-byte state, so undo is free.

use super::{ALL_DIGITS, Masks, digits};
use crate::search::{Ctx, Step};
use crate::{Grid, UNITS};

#[derive(Clone, Copy)]
struct State {
    cells: [u8; 81],
    masks: Masks,
}

impl State {
    fn place(&mut self, cell: usize, d: u8) {
        self.cells[cell] = d;
        self.masks.toggle(cell, d);
    }

    /// Digits already placed in unit `u` (rows 0-8, columns 9-17, boxes 18-26).
    fn used(&self, u: usize) -> u16 {
        match u {
            0..9 => self.masks.row[u],
            9..18 => self.masks.col[u - 9],
            _ => self.masks.bx[u - 18],
        }
    }
}

pub fn run(puzzle: &Grid, ctx: &mut Ctx) {
    let cells = puzzle.0;
    search(
        State {
            cells,
            masks: Masks::of(&cells),
        },
        ctx,
    );
}

/// Applies singles until a fixpoint, pushing each placed cell to `placed`.
/// `Some(false)` on a contradiction, `None` when the node limit is hit.
fn propagate(s: &mut State, ctx: &mut Ctx, placed: &mut Vec<usize>) -> Option<bool> {
    loop {
        let mut progress = false;
        for cell in 0..81 {
            if s.cells[cell] != 0 {
                continue;
            }
            ctx.stats.checks += 1;
            let free = s.masks.free(cell);
            match free.count_ones() {
                0 => return Some(false),
                1 => {
                    if !ctx.node() {
                        return None;
                    }
                    let d = free.trailing_zeros() as u8 + 1;
                    s.place(cell, d);
                    placed.push(cell);
                    ctx.event(cell, d, Step::Forced);
                    progress = true;
                }
                _ => {}
            }
        }
        for (u, unit) in UNITS.iter().enumerate() {
            // `once`: digits with at least one place; `twice`: at least two.
            let (mut once, mut twice) = (0u16, 0u16);
            for &c in unit {
                if s.cells[c as usize] == 0 {
                    ctx.stats.checks += 1;
                    let free = s.masks.free(c as usize);
                    twice |= once & free;
                    once |= free;
                }
            }
            if (once | s.used(u)) != ALL_DIGITS {
                return Some(false); // a missing digit has nowhere to go
            }
            for d in digits(once & !twice) {
                let bit = 1 << (d - 1);
                if s.used(u) & bit != 0 {
                    continue;
                }
                let Some(&cell) = unit
                    .iter()
                    .find(|&&c| s.cells[c as usize] == 0 && s.masks.free(c as usize) & bit != 0)
                else {
                    return Some(false); // an earlier single in this unit took its only cell
                };
                if !ctx.node() {
                    return None;
                }
                s.place(cell as usize, d);
                placed.push(cell as usize);
                ctx.event(cell as usize, d, Step::Forced);
                progress = true;
            }
        }
        if !progress {
            return Some(true);
        }
    }
}

/// True when the search should stop.
fn search(mut s: State, ctx: &mut Ctx) -> bool {
    let mut placed = Vec::new();
    let Some(consistent) = propagate(&mut s, ctx, &mut placed) else {
        return true; // node limit
    };
    let stop = consistent && branch(&s, ctx);
    if !stop {
        for &cell in placed.iter().rev() {
            ctx.event(cell, s.cells[cell], Step::Undo);
        }
    }
    stop
}

fn branch(s: &State, ctx: &mut Ctx) -> bool {
    let mut best: Option<(usize, u16)> = None;
    for cell in (0..81).filter(|&c| s.cells[c] == 0) {
        ctx.stats.checks += 1;
        let free = s.masks.free(cell);
        if best.is_none_or(|(_, b)| free.count_ones() < b.count_ones()) {
            best = Some((cell, free));
            if free.count_ones() == 2 {
                break; // propagation removed every 0 and 1, so 2 is the minimum
            }
        }
    }
    let Some((cell, free)) = best else {
        return ctx.found(&s.cells);
    };
    for d in digits(free) {
        if !ctx.node() {
            return true;
        }
        let mut next = *s;
        next.place(cell, d);
        ctx.event(cell, d, Step::Guess);
        if search(next, ctx) {
            return true;
        }
        ctx.stats.backtracks += 1;
        ctx.event(cell, d, Step::Undo);
    }
    false
}
