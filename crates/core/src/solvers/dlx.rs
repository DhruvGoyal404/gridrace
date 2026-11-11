//! Knuth's Algorithm X with Dancing Links. Sudoku as exact cover: 729 rows (cell, digit)
//! and 324 columns (each cell filled; each digit once per row, column and box). Pick the
//! column with fewest rows, try each row, cover the columns it satisfies, recurse.
//! Covering and uncovering are O(1) pointer splices on a circular doubly linked matrix.

use super::{Masks, digits};
use crate::search::{Ctx, Step};
use crate::{Grid, box_of, col, row};

const COLUMNS: usize = 324;

/// One node of the matrix: a header (0 = root, 1..=324 = columns) or a 1 in a row.
/// One array of these keeps a node's links on one cache line during cover and uncover.
#[derive(Clone, Copy)]
struct Node {
    left: u32,
    right: u32,
    up: u32,
    down: u32,
    column: u16,
    /// The candidate `cell * 9 + digit - 1` (row nodes only).
    candidate: u16,
}

struct Matrix {
    nodes: Vec<Node>,
    size: [u32; COLUMNS + 1],
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
        let masks = Masks::of(cells);
        let rows: u32 = (0..81)
            .filter(|&c| cells[c] == 0)
            .map(|c| masks.free(c).count_ones())
            .sum();
        let mut nodes = Vec::with_capacity(COLUMNS + 1 + rows as usize * 4);
        nodes.extend((0..=COLUMNS as u32).map(|i| Node {
            left: i,
            right: i,
            up: i,
            down: i,
            column: i as u16,
            candidate: 0,
        }));
        let mut m = Matrix {
            nodes,
            size: [0; COLUMNS + 1],
        };
        // Link the needed headers into one circular list with the root.
        let mut last = 0;
        for c in (1..=COLUMNS).filter(|&c| needed[c]) {
            m.nodes[last].right = c as u32;
            m.nodes[c].left = last as u32;
            last = c;
        }
        m.nodes[last].right = 0;
        m.nodes[0].left = last as u32;

        for cell in (0..81).filter(|&c| cells[c] == 0) {
            for d in digits(masks.free(cell)) {
                let d = d as usize - 1;
                let start = m.nodes.len() as u32;
                for (k, c) in columns(cell, d).into_iter().enumerate() {
                    let node = start + k as u32;
                    let above = m.nodes[c].up;
                    m.nodes.push(Node {
                        left: if k == 0 { start + 3 } else { node - 1 },
                        right: if k == 3 { start } else { node + 1 },
                        up: above,
                        down: c as u32,
                        column: c as u16,
                        candidate: (cell * 9 + d) as u16,
                    });
                    m.nodes[above as usize].down = node;
                    m.nodes[c].up = node;
                    m.size[c] += 1;
                }
            }
        }
        m
    }

    fn cover(&mut self, c: u32) {
        let n = &mut self.nodes;
        let c = c as usize;
        let (l, r) = (n[c].left, n[c].right);
        n[l as usize].right = r;
        n[r as usize].left = l;
        let mut i = n[c].down as usize;
        while i != c {
            let mut j = n[i].right as usize;
            while j != i {
                let Node {
                    up, down, column, ..
                } = n[j];
                n[up as usize].down = down;
                n[down as usize].up = up;
                self.size[column as usize] -= 1;
                j = n[j].right as usize;
            }
            i = n[i].down as usize;
        }
    }

    fn uncover(&mut self, c: u32) {
        let n = &mut self.nodes;
        let c = c as usize;
        let mut i = n[c].up as usize;
        while i != c {
            let mut j = n[i].left as usize;
            while j != i {
                let Node {
                    up, down, column, ..
                } = n[j];
                self.size[column as usize] += 1;
                n[up as usize].down = j as u32;
                n[down as usize].up = j as u32;
                j = n[j].left as usize;
            }
            i = n[i].up as usize;
        }
        let (l, r) = (n[c].left, n[c].right);
        n[l as usize].right = c as u32;
        n[r as usize].left = c as u32;
    }

    /// Covers every column of a row except the one it was reached through.
    fn select(&mut self, row: u32) {
        let mut j = self.nodes[row as usize].right;
        while j != row {
            self.cover(u32::from(self.nodes[j as usize].column));
            j = self.nodes[j as usize].right;
        }
    }

    fn deselect(&mut self, row: u32) {
        let mut j = self.nodes[row as usize].left;
        while j != row {
            self.uncover(u32::from(self.nodes[j as usize].column));
            j = self.nodes[j as usize].left;
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
    if m.nodes[0].right == 0 {
        return ctx.found(cells);
    }
    // Knuth's S heuristic: the column with fewest remaining rows. Stop scanning at size 0
    // (dead end: backtrack now) or 1 (forced: nothing can beat it).
    let mut best = m.nodes[0].right;
    let mut j = best;
    while j != 0 {
        ctx.stats.checks += 1;
        if m.size[j as usize] < m.size[best as usize] {
            best = j;
        }
        if m.size[best as usize] <= 1 {
            break;
        }
        j = m.nodes[j as usize].right;
    }
    if m.size[best as usize] == 0 {
        return false;
    }
    let forced = m.size[best as usize] == 1;
    m.cover(best);
    let mut r = m.nodes[best as usize].down;
    while r != best {
        if !ctx.node() {
            return true;
        }
        let cand = m.nodes[r as usize].candidate as usize;
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
        r = m.nodes[r as usize].down;
    }
    m.uncover(best);
    false
}
