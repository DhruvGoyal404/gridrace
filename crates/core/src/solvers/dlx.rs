//! Knuth's Algorithm X with Dancing Links. Sudoku as exact cover: 729 rows (cell, digit)
//! and 324 columns (each cell filled; each digit once per row, column and box). Pick the
//! column with fewest rows, try each row, cover the columns it satisfies, recurse.
//! Covering and uncovering are O(1) pointer splices on a circular doubly linked matrix.

use super::{Masks, digits};
use crate::search::{Ctx, Step};
use crate::{Grid, box_of, col, row};

const COLUMNS: usize = 324;

struct Matrix {
    left: Vec<u32>,
    right: Vec<u32>,
    up: Vec<u32>,
    down: Vec<u32>,
    column: Vec<u32>,
    size: [u32; COLUMNS + 1],
    /// For each node, its candidate `cell * 9 + digit - 1`.
    candidate: Vec<u16>,
}

/// The four columns a candidate satisfies, 1-based (node 0 is the root).
fn columns(cell: usize, d: usize) -> [usize; 4] {
    [
        1 + cell,
        1 + 81 + row(cell) * 9 + d,
        1 + 162 + col(cell) * 9 + d,
        1 + 243 + box_of(cell) * 9 + d,
    ]
}

impl Matrix {
    /// The matrix the givens leave: columns they already satisfy are not linked in, and
    /// only candidates legal next to them become rows. The givens never enter the search, so they cost no nodes.
    fn new(cells: &[u8; 81]) -> Self {
        let mut needed = [true; COLUMNS + 1];
        for (cell, &d) in cells.iter().enumerate() {
            if d != 0 {
                for c in columns(cell, d as usize - 1) {
                    needed[c] = false;
                }
            }
        }
        let n = COLUMNS + 1 + 729 * 4;
        let mut m = Matrix {
            left: Vec::with_capacity(n),
            right: Vec::with_capacity(n),
            up: Vec::with_capacity(n),
            down: Vec::with_capacity(n),
            column: Vec::with_capacity(n),
            size: [0; COLUMNS + 1],
            candidate: Vec::with_capacity(n),
        };
        for i in 0..=COLUMNS as u32 {
            m.left.push(i);
            m.right.push(i);
            m.up.push(i);
            m.down.push(i);
            m.column.push(i);
            m.candidate.push(0);
        }
        // Link the needed headers into one circular list with the root.
        let mut last = 0;
        for c in (1..=COLUMNS).filter(|&c| needed[c]) {
            m.right[last] = c as u32;
            m.left[c] = last as u32;
            last = c;
        }
        m.right[last] = 0;
        m.left[0] = last as u32;

        let masks = Masks::of(cells);
        for cell in (0..81).filter(|&c| cells[c] == 0) {
            for d in digits(masks.free(cell)) {
                let d = d as usize - 1;
                let start = m.left.len() as u32;
                for (k, c) in columns(cell, d).into_iter().enumerate() {
                    let node = start + k as u32;
                    m.left.push(if k == 0 { start + 3 } else { node - 1 });
                    m.right.push(if k == 3 { start } else { node + 1 });
                    m.up.push(m.up[c]);
                    m.down.push(c as u32);
                    let above = m.up[c] as usize;
                    m.down[above] = node;
                    m.up[c] = node;
                    m.column.push(c as u32);
                    m.candidate.push((cell * 9 + d) as u16);
                    m.size[c] += 1;
                }
            }
        }
        m
    }

    fn cover(&mut self, c: u32) {
        let c = c as usize;
        let (l, r) = (self.left[c], self.right[c]);
        self.right[l as usize] = r;
        self.left[r as usize] = l;
        let mut i = self.down[c] as usize;
        while i != c {
            let mut j = self.right[i] as usize;
            while j != i {
                let (u, d) = (self.up[j], self.down[j]);
                self.down[u as usize] = d;
                self.up[d as usize] = u;
                self.size[self.column[j] as usize] -= 1;
                j = self.right[j] as usize;
            }
            i = self.down[i] as usize;
        }
    }

    fn uncover(&mut self, c: u32) {
        let c = c as usize;
        let mut i = self.up[c] as usize;
        while i != c {
            let mut j = self.left[i] as usize;
            while j != i {
                self.size[self.column[j] as usize] += 1;
                let (u, d) = (self.up[j], self.down[j]);
                self.down[u as usize] = j as u32;
                self.up[d as usize] = j as u32;
                j = self.left[j] as usize;
            }
            i = self.up[i] as usize;
        }
        let (l, r) = (self.left[c], self.right[c]);
        self.right[l as usize] = c as u32;
        self.left[r as usize] = c as u32;
    }

    /// Covers every column of a row except the one it was reached through.
    fn select(&mut self, row: u32) {
        let mut j = self.right[row as usize];
        while j != row {
            self.cover(self.column[j as usize]);
            j = self.right[j as usize];
        }
    }

    fn deselect(&mut self, row: u32) {
        let mut j = self.left[row as usize];
        while j != row {
            self.uncover(self.column[j as usize]);
            j = self.left[j as usize];
        }
    }
}

pub fn run(puzzle: &Grid, ctx: &mut Ctx) {
    let mut m = Matrix::new(&puzzle.0);
    let mut cells = puzzle.0;
    search(&mut m, &mut cells, ctx);
}

/// True when the search should stop.
fn search(m: &mut Matrix, cells: &mut [u8; 81], ctx: &mut Ctx) -> bool {
    if m.right[0] == 0 {
        return ctx.found(cells);
    }
    // Knuth's S heuristic: the column with fewest remaining rows.
    let mut best = m.right[0];
    let mut j = best;
    while j != 0 {
        ctx.stats.checks += 1;
        if m.size[j as usize] < m.size[best as usize] {
            best = j;
            if m.size[best as usize] <= 1 {
                break;
            }
        }
        j = m.right[j as usize];
    }
    if m.size[best as usize] == 0 {
        return false;
    }
    let forced = m.size[best as usize] == 1;
    m.cover(best);
    let mut r = m.down[best as usize];
    while r != best {
        if !ctx.node() {
            return true;
        }
        let cand = m.candidate[r as usize] as usize;
        let (cell, d) = (cand / 9, (cand % 9) as u8 + 1);
        cells[cell] = d;
        ctx.event(cell, d, if forced { Step::Forced } else { Step::Guess });
        m.select(r);
        if search(m, cells, ctx) {
            return true;
        }
        m.deselect(r);
        cells[cell] = 0;
        if !forced {
            ctx.stats.backtracks += 1;
        }
        ctx.event(cell, d, Step::Undo);
        r = m.down[r as usize];
    }
    m.uncover(best);
    false
}
