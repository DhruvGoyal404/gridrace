//! A human-style solver: pencil marks and named techniques, easiest first. It powers hints
//! (each step says why) and grading (a puzzle is as hard as the hardest technique an
//! easiest-first solve needs, not as hard as its number of empty cells).
//!
//! The order follows Sudoku Explainer's ratings, read from the `getDifficulty()` methods
//! in its maintained fork Sukaku Explainer (github.com/SudokuMonster/SukakuExplainer,
//! `diuf/sudoku/solver/rules/`). Original SE ratings: hidden single 1.2 in a box / 1.5 in a
//! line, naked single 2.3, pointing 2.6, box-line reduction (claiming) 2.8, naked pair
//! 3.0, X-Wing 3.2, hidden pair 3.4, naked triple 3.6, Swordfish 3.8, hidden triple 4.0,
//! XY-Wing 4.2, unique rectangle 4.5 (`unique/UniqueLoopHint.java`), forcing X-Chain 6.6
//! and forcing chain mixing cell and unit links (our XY-Chain) 7.0, plus a length bonus
//! (`chaining/ForcingChainHint.java`). Skyscraper 4.0 and 2-String Kite 4.1 are Sukaku's
//! additions (`TurbotFishHint.java`). SE has no W-Wing; `HoDoKu` (`sudoku/Options.java`)
//! searches it between 2-String Kite and XY-Wing and scores it like the Kite, so it sits
//! there. Only the numbers and order are used; no code comes from either project.
//!
//! Unique Rectangle assumes the puzzle has exactly one solution. Generated puzzles do, and
//! `hint` checks before solving; on a puzzle with several solutions its steps can be wrong.

use crate::grid::PEERS;
use crate::solvers::digits;
use crate::{Grid, UNITS, are_peers, box_of, col, row};
use std::collections::VecDeque;
use std::fmt::Write as _;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Technique {
    HiddenSingle,
    NakedSingle,
    Pointing,
    BoxLineReduction,
    NakedPair,
    XWing,
    HiddenPair,
    NakedTriple,
    Swordfish,
    HiddenTriple,
    Skyscraper,
    TwoStringKite,
    WWing,
    XYWing,
    UniqueRectangle,
    XChain,
    XYChain,
}

impl Technique {
    pub const COUNT: usize = 17;

    pub const ALL: [Technique; Self::COUNT] = [
        Self::HiddenSingle,
        Self::NakedSingle,
        Self::Pointing,
        Self::BoxLineReduction,
        Self::NakedPair,
        Self::XWing,
        Self::HiddenPair,
        Self::NakedTriple,
        Self::Swordfish,
        Self::HiddenTriple,
        Self::Skyscraper,
        Self::TwoStringKite,
        Self::WWing,
        Self::XYWing,
        Self::UniqueRectangle,
        Self::XChain,
        Self::XYChain,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::HiddenSingle => "Hidden single",
            Self::NakedSingle => "Naked single",
            Self::Pointing => "Pointing",
            Self::BoxLineReduction => "Box-line reduction",
            Self::NakedPair => "Naked pair",
            Self::XWing => "X-Wing",
            Self::HiddenPair => "Hidden pair",
            Self::NakedTriple => "Naked triple",
            Self::Swordfish => "Swordfish",
            Self::HiddenTriple => "Hidden triple",
            Self::Skyscraper => "Skyscraper",
            Self::TwoStringKite => "2-String Kite",
            Self::WWing => "W-Wing",
            Self::XYWing => "XY-Wing",
            Self::UniqueRectangle => "Unique rectangle",
            Self::XChain => "X-Chain",
            Self::XYChain => "XY-Chain",
        }
    }

    /// The rating the order comes from (see the module docs); "-" where SE has none.
    pub const fn rating(self) -> &'static str {
        match self {
            Self::HiddenSingle => "1.2/1.5",
            Self::NakedSingle => "2.3",
            Self::Pointing => "2.6",
            Self::BoxLineReduction => "2.8",
            Self::NakedPair => "3.0",
            Self::XWing => "3.2",
            Self::HiddenPair => "3.4",
            Self::NakedTriple => "3.6",
            Self::Swordfish => "3.8",
            Self::HiddenTriple | Self::Skyscraper => "4.0",
            Self::TwoStringKite => "4.1",
            Self::WWing => "-",
            Self::XYWing => "4.2",
            Self::UniqueRectangle => "4.5",
            Self::XChain => "6.6+",
            Self::XYChain => "7.0+",
        }
    }

    pub const fn difficulty(self) -> Difficulty {
        match self {
            Self::HiddenSingle | Self::NakedSingle => Difficulty::Easy,
            Self::Pointing | Self::BoxLineReduction => Difficulty::Medium,
            Self::NakedPair | Self::XWing | Self::HiddenPair => Difficulty::Hard,
            Self::NakedTriple
            | Self::Swordfish
            | Self::HiddenTriple
            | Self::Skyscraper
            | Self::TwoStringKite
            | Self::WWing
            | Self::XYWing
            | Self::UniqueRectangle => Difficulty::Expert,
            Self::XChain | Self::XYChain => Difficulty::Master,
        }
    }
}

/// Tiers by the hardest technique needed. `Beyond` needs more than these techniques:
/// a guess, or a pattern this solver doesn't know.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    Expert,
    Master,
    Beyond,
}

impl Difficulty {
    pub const ALL: [Difficulty; 6] = [
        Self::Easy,
        Self::Medium,
        Self::Hard,
        Self::Expert,
        Self::Master,
        Self::Beyond,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::Easy => "Easy",
            Self::Medium => "Medium",
            Self::Hard => "Hard",
            Self::Expert => "Expert",
            Self::Master => "Master",
            Self::Beyond => "Beyond",
        }
    }
}

/// One deduction: either a placement or eliminations, with the pattern that proves it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Step {
    pub technique: Technique,
    /// `(cell, digit)` to place: singles only.
    pub place: Option<(u8, u8)>,
    /// `(cell, digit)` candidates to remove.
    pub eliminate: Vec<(u8, u8)>,
    /// The cells that form the pattern, to highlight.
    pub cells: Vec<u8>,
    /// The digits the pattern is about, bit `d - 1` for digit `d`.
    pub digits: u16,
    /// The house the pattern lives in (rows 0-8, columns 9-17, boxes 18-26), if one.
    pub unit: Option<u8>,
    pub explanation: String,
}

/// Placed digits plus candidates (pencil marks) for every empty cell.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Board {
    pub cells: [u8; 81],
    /// Candidates of each empty cell, bit `d - 1` for digit `d`. 0 for a filled cell.
    pub cands: [u16; 81],
}

const fn bit(d: u8) -> u16 {
    1 << (d - 1)
}

/// "r4c6": row and column, 1-based.
pub fn cell_name(cell: usize) -> String {
    format!("r{}c{}", row(cell) + 1, col(cell) + 1)
}

/// "row 4", "column 6", "box 5" (boxes numbered 1-9 left to right, top to bottom).
pub fn unit_name(unit: usize) -> String {
    match unit {
        0..9 => format!("row {}", unit + 1),
        9..18 => format!("column {}", unit - 8),
        _ => format!("box {}", unit - 17),
    }
}

fn digit_list(mask: u16) -> String {
    let ds: Vec<String> = digits(mask).map(|d| d.to_string()).collect();
    match ds.as_slice() {
        [] => String::new(),
        [one] => one.clone(),
        [init @ .., last] => format!("{} and {last}", init.join(", ")),
    }
}

fn cell_list(cells: &[u8]) -> String {
    let names: Vec<String> = cells.iter().map(|&c| cell_name(c as usize)).collect();
    match names.as_slice() {
        [] => String::new(),
        [one] => one.clone(),
        [init @ .., last] => format!("{} and {last}", init.join(", ")),
    }
}

/// "removes 7 from r1c1 and r1c2" grouped by digit.
fn elimination_text(elims: &[(u8, u8)]) -> String {
    let mut by_digit: Vec<(u8, Vec<u8>)> = Vec::new();
    for &(c, d) in elims {
        match by_digit.iter_mut().find(|(x, _)| *x == d) {
            Some((_, cells)) => cells.push(c),
            None => by_digit.push((d, vec![c])),
        }
    }
    let parts: Vec<String> = by_digit
        .iter()
        .map(|(d, cells)| format!("{d} from {}", cell_list(cells)))
        .collect();
    format!("removes {}", parts.join("; "))
}

impl Board {
    /// Candidates from the placed digits only. Conflicting digits leave cells with no
    /// candidates; callers check conflicts first.
    pub fn new(grid: &Grid) -> Self {
        let mut b = Board {
            cells: grid.0,
            cands: [0; 81],
        };
        for c in 0..81 {
            if b.cells[c] == 0 {
                b.cands[c] = b.peer_free(c);
            }
        }
        b
    }

    /// Candidates of an empty cell from its peers' digits alone, before any elimination.
    fn peer_free(&self, cell: usize) -> u16 {
        let used = PEERS[cell]
            .iter()
            .fold(0u16, |m, &p| match self.cells[p as usize] {
                0 => m,
                d => m | bit(d),
            });
        0x1FF & !used
    }

    pub fn is_solved(&self) -> bool {
        self.cells.iter().all(|&d| d != 0)
    }

    pub fn place(&mut self, cell: usize, d: u8) {
        self.cells[cell] = d;
        self.cands[cell] = 0;
        for &p in &PEERS[cell] {
            self.cands[p as usize] &= !bit(d);
        }
    }

    pub fn apply(&mut self, step: &Step) {
        if let Some((c, d)) = step.place {
            self.place(c as usize, d);
        }
        for &(c, d) in &step.eliminate {
            self.cands[c as usize] &= !bit(d);
        }
    }

    /// Digits already placed in a unit.
    fn placed(&self, unit: usize) -> u16 {
        UNITS[unit]
            .iter()
            .fold(0, |m, &c| match self.cells[c as usize] {
                0 => m,
                d => m | bit(d),
            })
    }

    /// Cells of a unit that still have digit `d` as a candidate.
    fn spots(&self, unit: usize, d: u8) -> Vec<u8> {
        UNITS[unit]
            .iter()
            .copied()
            .filter(|&c| self.cands[c as usize] & bit(d) != 0)
            .collect()
    }

    /// The easiest step available, or `None` if none of the techniques applies.
    pub fn next_step(&self) -> Option<Step> {
        Technique::ALL.iter().find_map(|&t| self.find(t))
    }

    /// The first step using technique `t`, if any.
    pub fn find(&self, t: Technique) -> Option<Step> {
        match t {
            Technique::HiddenSingle => self.hidden_single(),
            Technique::NakedSingle => self.naked_single(),
            Technique::Pointing => self.pointing(),
            Technique::BoxLineReduction => self.box_line(),
            Technique::NakedPair => self.naked_subset(2, t),
            Technique::NakedTriple => self.naked_subset(3, t),
            Technique::HiddenPair => self.hidden_subset(2, t),
            Technique::HiddenTriple => self.hidden_subset(3, t),
            Technique::XWing => self.fish(2, t),
            Technique::Swordfish => self.fish(3, t),
            Technique::XYWing => self.xy_wing(),
            Technique::Skyscraper | Technique::TwoStringKite => self.turbot(t),
            Technique::WWing => self.w_wing(),
            Technique::UniqueRectangle => self.unique_rectangle(),
            Technique::XChain => self.x_chain(),
            Technique::XYChain => self.xy_chain(),
        }
    }

    fn hidden_single(&self) -> Option<Step> {
        // Boxes first: that is where people look first, and it rates easier.
        for unit in (18..27).chain(0..18) {
            let open = 0x1FF & !self.placed(unit);
            for d in digits(open) {
                if let [cell] = self.spots(unit, d)[..] {
                    return Some(Step {
                        technique: Technique::HiddenSingle,
                        place: Some((cell, d)),
                        eliminate: vec![],
                        cells: vec![cell],
                        digits: bit(d),
                        unit: Some(unit as u8),
                        explanation: format!(
                            "Hidden single: in {}, {d} fits only in {}. No other cell of the {} can hold a {d}.",
                            unit_name(unit),
                            cell_name(cell as usize),
                            unit_name(unit).split(' ').next().unwrap_or("unit"),
                        ),
                    });
                }
            }
        }
        None
    }

    fn naked_single(&self) -> Option<Step> {
        let cell = (0..81).find(|&c| self.cands[c].is_power_of_two())?;
        let d = self.cands[cell].trailing_zeros() as u8 + 1;
        Some(Step {
            technique: Technique::NakedSingle,
            place: Some((cell as u8, d)),
            eliminate: vec![],
            cells: vec![cell as u8],
            digits: bit(d),
            unit: None,
            explanation: if self.cands[cell] == self.peer_free(cell) {
                format!(
                    "Naked single: {} can only be {d}. The other eight digits are already in its row, column or box.",
                    cell_name(cell)
                )
            } else {
                format!(
                    "Naked single: {} can only be {d}. Its row, column and box, with the eliminations above, rule out every other digit.",
                    cell_name(cell)
                )
            },
        })
    }

    /// A digit's candidates in a box all lie on one line: the box will place it there,
    /// so the rest of that line can't hold it.
    fn pointing(&self) -> Option<Step> {
        for b in 0..9 {
            let unit = 18 + b;
            for d in 1..=9 {
                let spots = self.spots(unit, d);
                if spots.len() < 2 {
                    continue;
                }
                for line in [row(spots[0] as usize), 9 + col(spots[0] as usize)] {
                    if !spots.iter().all(|&c| UNITS[line].contains(&c)) {
                        continue;
                    }
                    let elims: Vec<(u8, u8)> = self
                        .spots(line, d)
                        .into_iter()
                        .filter(|&c| box_of(c as usize) != b)
                        .map(|c| (c, d))
                        .collect();
                    if !elims.is_empty() {
                        let kind = if spots.len() == 2 { "pair" } else { "triple" };
                        return Some(Step {
                            technique: Technique::Pointing,
                            place: None,
                            explanation: format!(
                                "Pointing {kind}: in {}, {d} can only go in {}, all on {}. Whichever it is, {} gets its {d} inside the box, so this {}.",
                                unit_name(unit),
                                cell_list(&spots),
                                unit_name(line),
                                unit_name(line),
                                elimination_text(&elims),
                            ),
                            eliminate: elims,
                            cells: spots,
                            digits: bit(d),
                            unit: Some(unit as u8),
                        });
                    }
                }
            }
        }
        None
    }

    /// A digit's candidates on a line all lie in one box: the line will place it in that
    /// box, so the rest of the box can't hold it.
    fn box_line(&self) -> Option<Step> {
        for (line, line_cells) in UNITS.iter().enumerate().take(18) {
            for d in 1..=9 {
                let spots = self.spots(line, d);
                if spots.len() < 2 {
                    continue;
                }
                let b = box_of(spots[0] as usize);
                if !spots.iter().all(|&c| box_of(c as usize) == b) {
                    continue;
                }
                let elims: Vec<(u8, u8)> = self
                    .spots(18 + b, d)
                    .into_iter()
                    .filter(|c| !line_cells.contains(c))
                    .map(|c| (c, d))
                    .collect();
                if !elims.is_empty() {
                    return Some(Step {
                        technique: Technique::BoxLineReduction,
                        place: None,
                        explanation: format!(
                            "Box-line reduction: in {}, {d} can only go in {}, all inside {}. So {} gets its {d} on that line, and this {}.",
                            unit_name(line),
                            cell_list(&spots),
                            unit_name(18 + b),
                            unit_name(18 + b),
                            elimination_text(&elims),
                        ),
                        eliminate: elims,
                        cells: spots,
                        digits: bit(d),
                        unit: Some(line as u8),
                    });
                }
            }
        }
        None
    }

    /// k cells of a unit whose candidates together are exactly k digits: those digits
    /// must go in those cells, so no other cell of the unit can hold them.
    fn naked_subset(&self, k: usize, t: Technique) -> Option<Step> {
        for (unit, unit_cells) in UNITS.iter().enumerate() {
            let open: Vec<u8> = unit_cells
                .iter()
                .copied()
                .filter(|&c| {
                    let n = self.cands[c as usize].count_ones() as usize;
                    (2..=k).contains(&n)
                })
                .collect();
            for combo in combinations(open.len(), k) {
                let cells: Vec<u8> = combo.iter().map(|&i| open[i]).collect();
                let mask = cells.iter().fold(0, |m, &c| m | self.cands[c as usize]);
                if mask.count_ones() as usize != k {
                    continue;
                }
                let elims = self.eliminations(unit, &cells, mask);
                if !elims.is_empty() {
                    let name = if k == 2 { "pair" } else { "triple" };
                    return Some(Step {
                        technique: t,
                        place: None,
                        explanation: format!(
                            "Naked {name}: in {}, {} can only hold {} between them, so those digits are used up there. This {}.",
                            unit_name(unit),
                            cell_list(&cells),
                            digit_list(mask),
                            elimination_text(&elims),
                        ),
                        eliminate: elims,
                        cells,
                        digits: mask,
                        unit: Some(unit as u8),
                    });
                }
            }
        }
        None
    }

    /// Candidates in `mask` from cells of `unit` outside `pattern`.
    fn eliminations(&self, unit: usize, pattern: &[u8], mask: u16) -> Vec<(u8, u8)> {
        let mut out = Vec::new();
        for &c in &UNITS[unit] {
            if !pattern.contains(&c) {
                for d in digits(self.cands[c as usize] & mask) {
                    out.push((c, d));
                }
            }
        }
        out
    }

    /// k digits of a unit that fit in only the same k cells: those cells hold those
    /// digits, so any other candidate in them goes.
    fn hidden_subset(&self, k: usize, t: Technique) -> Option<Step> {
        for unit in 0..27 {
            let open: Vec<u8> = digits(0x1FF & !self.placed(unit))
                .filter(|&d| (2..=k).contains(&self.spots(unit, d).len()))
                .collect();
            for combo in combinations(open.len(), k) {
                let ds: Vec<u8> = combo.iter().map(|&i| open[i]).collect();
                let mut cells: Vec<u8> = ds.iter().flat_map(|&d| self.spots(unit, d)).collect();
                cells.sort_unstable();
                cells.dedup();
                if cells.len() != k {
                    continue;
                }
                let mask = ds.iter().fold(0, |m, &d| m | bit(d));
                let elims: Vec<(u8, u8)> = cells
                    .iter()
                    .flat_map(|&c| digits(self.cands[c as usize] & !mask).map(move |d| (c, d)))
                    .collect();
                if !elims.is_empty() {
                    let name = if k == 2 { "pair" } else { "triple" };
                    return Some(Step {
                        technique: t,
                        place: None,
                        explanation: format!(
                            "Hidden {name}: in {}, {} fit only in {}, so those cells hold exactly those digits. This {}.",
                            unit_name(unit),
                            digit_list(mask),
                            cell_list(&cells),
                            elimination_text(&elims),
                        ),
                        eliminate: elims,
                        cells,
                        digits: mask,
                        unit: Some(unit as u8),
                    });
                }
            }
        }
        None
    }

    /// X-Wing (k = 2) and Swordfish (k = 3): k rows where a digit fits only within the
    /// same k columns. Each row takes the digit in one of those columns, so together they
    /// fill all k columns, and no other row can use them. Same with rows and columns swapped.
    fn fish(&self, k: usize, t: Technique) -> Option<Step> {
        for d in 1..=9 {
            for (base, cover_of, label) in [
                (0..9, col as fn(usize) -> usize, ("rows", "columns")),
                (9..18, row as fn(usize) -> usize, ("columns", "rows")),
            ] {
                let lines: Vec<(usize, u16)> = base
                    .map(|line| {
                        let m = self
                            .spots(line, d)
                            .iter()
                            .fold(0u16, |m, &c| m | 1 << cover_of(c as usize));
                        (line, m)
                    })
                    .filter(|&(_, m)| (2..=k).contains(&(m.count_ones() as usize)))
                    .collect();
                for combo in combinations(lines.len(), k) {
                    let chosen: Vec<(usize, u16)> = combo.iter().map(|&i| lines[i]).collect();
                    let covers = chosen.iter().fold(0u16, |m, &(_, x)| m | x);
                    if covers.count_ones() as usize != k {
                        continue;
                    }
                    let is_base =
                        |c: usize| chosen.iter().any(|&(l, _)| UNITS[l].contains(&(c as u8)));
                    let mut elims = Vec::new();
                    let mut pattern = Vec::new();
                    for x in (0..9).filter(|x| covers & (1 << x) != 0) {
                        let cover_unit = if label.0 == "rows" { 9 + x } else { x };
                        for c in self.spots(cover_unit, d) {
                            if is_base(c as usize) {
                                pattern.push(c);
                            } else {
                                elims.push((c, d));
                            }
                        }
                    }
                    if !elims.is_empty() {
                        pattern.sort_unstable();
                        let base_names: Vec<String> =
                            chosen.iter().map(|&(l, _)| unit_name(l)).collect();
                        return Some(Step {
                            technique: t,
                            place: None,
                            explanation: format!(
                                "{}: in {}, {d} fits only within the same {k} {}. Those {k} {} must take their {d} there, so it {}.",
                                t.name(),
                                base_names.join(", "),
                                label.1,
                                label.0,
                                elimination_text(&elims),
                            ),
                            eliminate: elims,
                            cells: pattern,
                            digits: bit(d),
                            unit: None,
                        });
                    }
                }
            }
        }
        None
    }

    /// A pivot with candidates {x, y} sees a pincer {x, z} and a pincer {y, z}. Whatever
    /// the pivot is, one pincer becomes z, so a cell that sees both pincers can't be z.
    fn xy_wing(&self) -> Option<Step> {
        let bivalue = |c: usize| self.cands[c].count_ones() == 2;
        for pivot in (0..81).filter(|&c| bivalue(c)) {
            let pv = self.cands[pivot];
            let wings: Vec<usize> = PEERS[pivot]
                .iter()
                .map(|&p| p as usize)
                .filter(|&p| bivalue(p) && (self.cands[p] & pv).is_power_of_two())
                .collect();
            for (i, &a) in wings.iter().enumerate() {
                for &b in &wings[i + 1..] {
                    let (ca, cb) = (self.cands[a], self.cands[b]);
                    let z = ca & cb & !pv;
                    // a and b share a different pivot digit, and a common third digit z.
                    if z.count_ones() != 1 || ca & pv == cb & pv {
                        continue;
                    }
                    let zd = z.trailing_zeros() as u8 + 1;
                    let elims: Vec<(u8, u8)> = PEERS[a]
                        .iter()
                        .copied()
                        .filter(|&c| {
                            c as usize != pivot
                                && c as usize != b
                                && PEERS[b].contains(&c)
                                && self.cands[c as usize] & z != 0
                        })
                        .map(|c| (c, zd))
                        .collect();
                    if !elims.is_empty() {
                        let cells = vec![pivot as u8, a as u8, b as u8];
                        return Some(Step {
                            technique: Technique::XYWing,
                            place: None,
                            explanation: format!(
                                "XY-Wing: {} is {} or {}. If {}, {} must be {zd}; if {}, {} must be {zd}. Either way one of them is {zd}, so it {}.",
                                cell_name(pivot),
                                digit_list(pv & ca),
                                digit_list(pv & cb),
                                digit_list(pv & ca),
                                cell_name(a),
                                digit_list(pv & cb),
                                cell_name(b),
                                elimination_text(&elims),
                            ),
                            eliminate: elims,
                            cells,
                            digits: pv | z,
                            unit: None,
                        });
                    }
                }
            }
        }
        None
    }
}

/// A chain found by a search: its cells, one detail per link or cell, eliminations, digit.
type Found<T> = (Vec<u8>, Vec<T>, Vec<(u8, u8)>, u8);

/// Longest chain searched, in links. Shortest chains are found first (breadth-first), so
/// this only bounds the work when no chain exists.
const MAX_CHAIN_LINKS: usize = 15;

impl Board {
    /// Pairs of cells that are the only two spots for `d` in some unit: a strong link,
    /// one of the two must be `d`. Each pair once, with the first unit that makes it.
    fn conjugates(&self, d: u8, units: std::ops::Range<usize>) -> Vec<(u8, u8, usize)> {
        let mut out: Vec<(u8, u8, usize)> = Vec::new();
        for unit in units {
            if let [a, b] = self.spots(unit, d)[..]
                && !out.iter().any(|&(x, y, _)| (x, y) == (a, b))
            {
                out.push((a, b, unit));
            }
        }
        out
    }

    /// `(cell, d)` for each cell with candidate `d` that sees both `a` and `b`.
    fn seeing_both(&self, a: u8, b: u8, d: u8) -> Vec<(u8, u8)> {
        (0..81u8)
            .filter(|&c| {
                c != a
                    && c != b
                    && self.cands[c as usize] & bit(d) != 0
                    && are_peers(c as usize, a as usize)
                    && are_peers(c as usize, b as usize)
            })
            .map(|c| (c, d))
            .collect()
    }

    /// Skyscraper (two rows, or two columns) and 2-String Kite (a row and a column): two
    /// strong links on one digit whose near ends see each other, so they can't both be the
    /// digit. Then one of the far ends is, and cells seeing both far ends can't be.
    fn turbot(&self, t: Technique) -> Option<Step> {
        for d in 1..=9 {
            let links = self.conjugates(d, 0..18);
            for (i, &(p1, p2, u)) in links.iter().enumerate() {
                for &(q1, q2, v) in &links[i + 1..] {
                    let parallel = (u < 9) == (v < 9);
                    if parallel != (t == Technique::Skyscraper) {
                        continue;
                    }
                    for (near1, far1) in [(p1, p2), (p2, p1)] {
                        for (near2, far2) in [(q1, q2), (q2, q1)] {
                            let cells = [near1, far1, near2, far2];
                            let distinct = (0..4).all(|x| (x + 1..4).all(|y| cells[x] != cells[y]));
                            let (n1, n2) = (near1 as usize, near2 as usize);
                            let joined = if parallel {
                                // The near ends share the cross line; the far ends don't.
                                // Far ends on one cross line would be an X-Wing.
                                let (f1, f2) = (far1 as usize, far2 as usize);
                                if u < 9 {
                                    col(n1) == col(n2) && col(f1) != col(f2)
                                } else {
                                    row(n1) == row(n2) && row(f1) != row(f2)
                                }
                            } else {
                                box_of(n1) == box_of(n2)
                            };
                            if !distinct || !joined {
                                continue;
                            }
                            let elims = self.seeing_both(far1, far2, d);
                            if elims.is_empty() {
                                continue;
                            }
                            let link = if parallel {
                                format!(
                                    "share {}",
                                    if u < 9 {
                                        unit_name(9 + col(n1))
                                    } else {
                                        unit_name(row(n1))
                                    }
                                )
                            } else {
                                format!("share {}", unit_name(18 + box_of(n1)))
                            };
                            return Some(Step {
                                technique: t,
                                place: None,
                                explanation: format!(
                                    "{}: in {}, {d} fits only in {} and {}; in {}, only in {} and {}. {} and {} {link}, so at most one of them is {d}. Then {} or {} must be {d}, so this {}.",
                                    t.name(),
                                    unit_name(u),
                                    cell_name(near1 as usize),
                                    cell_name(far1 as usize),
                                    unit_name(v),
                                    cell_name(near2 as usize),
                                    cell_name(far2 as usize),
                                    cell_name(n1),
                                    cell_name(n2),
                                    cell_name(far1 as usize),
                                    cell_name(far2 as usize),
                                    elimination_text(&elims),
                                ),
                                eliminate: elims,
                                cells: cells.to_vec(),
                                digits: bit(d),
                                unit: None,
                            });
                        }
                    }
                }
            }
        }
        None
    }

    /// Two cells with the same two candidates {x, y} that don't see each other, joined by
    /// a strong link on x (each end of the link sees one of them). If the first isn't y it
    /// is x, so its end of the link isn't x, so the other end is, so the second isn't x:
    /// it's y. One of the two is y, so cells seeing both can't be.
    fn w_wing(&self) -> Option<Step> {
        let bivalue: Vec<usize> = (0..81)
            .filter(|&c| self.cands[c].count_ones() == 2)
            .collect();
        for (i, &a) in bivalue.iter().enumerate() {
            for &b in &bivalue[i + 1..] {
                let pair = self.cands[a];
                if self.cands[b] != pair || are_peers(a, b) {
                    continue;
                }
                for x in digits(pair) {
                    let y = digits(pair & !bit(x)).next().expect("two candidates");
                    for (c, e, unit) in self.conjugates(x, 0..27) {
                        let (c, e) = (c as usize, e as usize);
                        let ends = if are_peers(c, a) && are_peers(e, b) {
                            (c, e)
                        } else if are_peers(e, a) && are_peers(c, b) {
                            (e, c)
                        } else {
                            continue;
                        };
                        if [a, b].contains(&c) || [a, b].contains(&e) {
                            continue;
                        }
                        let elims = self.seeing_both(a as u8, b as u8, y);
                        if elims.is_empty() {
                            continue;
                        }
                        return Some(Step {
                            technique: Technique::WWing,
                            place: None,
                            explanation: format!(
                                "W-Wing: {} and {} can only be {}. In {}, {x} fits only in {} and {}, which see one each. If {} isn't {y} it is {x}, so {} isn't {x}, so {} is {x}, so {} isn't {x}: it's {y}. One of them is {y}, so it {}.",
                                cell_name(a),
                                cell_name(b),
                                digit_list(pair),
                                unit_name(unit),
                                cell_name(ends.0),
                                cell_name(ends.1),
                                cell_name(a),
                                cell_name(ends.0),
                                cell_name(ends.1),
                                cell_name(b),
                                elimination_text(&elims),
                            ),
                            eliminate: elims,
                            cells: vec![a as u8, b as u8, ends.0 as u8, ends.1 as u8],
                            digits: pair,
                            unit: Some(unit as u8),
                        });
                    }
                }
            }
        }
        None
    }

    /// Four cells on two rows, two columns and two boxes, three of them holding only
    /// {x, y}. If the fourth could also be only x or y, the x's and y's could be swapped
    /// and the puzzle would have two solutions. It has one, so the fourth is neither.
    fn unique_rectangle(&self) -> Option<Step> {
        for r1 in 0..9 {
            for r2 in r1 + 1..9 {
                for c1 in 0..9 {
                    for c2 in c1 + 1..9 {
                        let corners = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
                        let same_band = r1 / 3 == r2 / 3;
                        let same_stack = c1 / 3 == c2 / 3;
                        if same_band == same_stack || corners.iter().any(|&c| self.cells[c] != 0) {
                            continue; // must span exactly two boxes, all four cells open
                        }
                        for (k, &odd) in corners.iter().enumerate() {
                            let rest: Vec<usize> = corners
                                .iter()
                                .enumerate()
                                .filter(|&(j, _)| j != k)
                                .map(|(_, &c)| c)
                                .collect();
                            let pair = self.cands[rest[0]];
                            if pair.count_ones() != 2
                                || rest.iter().any(|&c| self.cands[c] != pair)
                                || self.cands[odd] & pair != pair
                                || self.cands[odd] == pair
                            {
                                continue;
                            }
                            let elims: Vec<(u8, u8)> =
                                digits(pair).map(|d| (odd as u8, d)).collect();
                            let (x, y) = (elims[0].1, elims[1].1);
                            return Some(Step {
                                technique: Technique::UniqueRectangle,
                                place: None,
                                explanation: format!(
                                    "Unique rectangle: {} can only be {x} or {y}. If {} were also only {x} or {y}, the four cells could swap their {x}s and {y}s and the puzzle would have two solutions. It has one, so this {}.",
                                    cell_list(&rest.iter().map(|&c| c as u8).collect::<Vec<_>>()),
                                    cell_name(odd),
                                    elimination_text(&elims),
                                ),
                                eliminate: elims,
                                cells: corners.iter().map(|&c| c as u8).collect(),
                                digits: pair,
                                unit: None,
                            });
                        }
                    }
                }
            }
        }
        None
    }

    /// X-Chain on one digit: strong and weak links alternate, starting and ending strong.
    /// "If the first cell isn't d, the next is (only two in that unit), so the next isn't
    /// (they see each other)..." ends at "the last cell is d". So one end is d, and cells
    /// seeing both ends can't be. The shortest chain with an elimination is reported.
    fn x_chain(&self) -> Option<Step> {
        // (cells, strong-link units, eliminations, digit)
        let mut best: Option<Found<usize>> = None;
        for d in 1..=9 {
            let mut strong: Vec<Vec<(u8, usize)>> = vec![Vec::new(); 81];
            for (a, b, unit) in self.conjugates(d, 0..27) {
                strong[a as usize].push((b, unit));
                strong[b as usize].push((a, unit));
            }
            let with_d: Vec<u8> = (0..81u8)
                .filter(|&c| self.cands[c as usize] & bit(d) != 0)
                .collect();
            for &start in &with_d {
                // State: (cell, arrived by a strong link). prev holds the parent and the unit.
                let mut prev: Vec<Option<(usize, usize)>> = vec![None; 162];
                let mut depth = vec![usize::MAX; 162];
                let mut queue = VecDeque::new();
                for &(n, unit) in &strong[start as usize] {
                    let s = n as usize * 2 + 1;
                    if depth[s] == usize::MAX {
                        depth[s] = 1;
                        prev[s] = Some((start as usize * 2, unit));
                        queue.push_back(s);
                    }
                }
                while let Some(s) = queue.pop_front() {
                    let (cell, by_strong) = (s / 2, s % 2 == 1);
                    if depth[s] >= MAX_CHAIN_LINKS
                        || best.as_ref().is_some_and(|b| b.0.len() - 1 <= depth[s])
                    {
                        continue;
                    }
                    if by_strong && depth[s] >= 3 && cell != start as usize {
                        let elims = self.seeing_both(start, cell as u8, d);
                        if !elims.is_empty() {
                            let (cells, units) = path(&prev, s, start as usize * 2);
                            if is_simple(&cells) {
                                best = Some((cells, units, elims, d));
                                continue;
                            }
                        }
                    }
                    let next: Vec<(u8, usize)> = if by_strong {
                        with_d
                            .iter()
                            .filter(|&&n| are_peers(cell, n as usize))
                            .map(|&n| (n, usize::MAX))
                            .collect()
                    } else {
                        strong[cell].clone()
                    };
                    for (n, unit) in next {
                        let t = n as usize * 2 + usize::from(!by_strong);
                        if depth[t] == usize::MAX {
                            depth[t] = depth[s] + 1;
                            prev[t] = Some((s, unit));
                            queue.push_back(t);
                        }
                    }
                }
            }
        }
        let (cells, units, elims, d) = best?;
        let mut why = format!("If {} isn't {d}", cell_name(cells[0] as usize));
        for (i, pair) in cells.windows(2).enumerate() {
            let next = cell_name(pair[1] as usize);
            if i % 2 == 0 {
                let _ = write!(
                    why,
                    ", {next} is (the only other {d} in {})",
                    unit_name(units[i])
                );
            } else {
                let _ = write!(
                    why,
                    ", so {next} isn't (it sees {})",
                    cell_name(pair[0] as usize)
                );
            }
        }
        let (first, last) = (cells[0] as usize, *cells.last().unwrap() as usize);
        Some(Step {
            technique: Technique::XChain,
            place: None,
            explanation: format!(
                "X-Chain on {d}: {why}. So {} or {} is {d}, and this {}.",
                cell_name(first),
                cell_name(last),
                elimination_text(&elims),
            ),
            eliminate: elims,
            cells,
            digits: bit(d),
            unit: None,
        })
    }

    /// XY-Chain through cells with two candidates: "if the first isn't z it is a, so the
    /// next (a peer holding a) isn't a and is b, ..." until a cell that must be z. One end
    /// is z, so cells seeing both ends can't be. The shortest such chain is reported.
    fn xy_chain(&self) -> Option<Step> {
        let bivalue = |c: usize| self.cands[c].count_ones() == 2;
        // (cells, digit each cell must be, eliminations, z)
        let mut best: Option<Found<u8>> = None;
        for start in (0..81).filter(|&c| bivalue(c)) {
            for z in digits(self.cands[start]) {
                // State: (cell, the digit it must then be). prev holds the parent state.
                let state = |c: usize, d: u8| c * 9 + d as usize - 1;
                let mut prev: Vec<Option<usize>> = vec![None; 729];
                let mut depth = vec![usize::MAX; 729];
                let on = digits(self.cands[start] & !bit(z))
                    .next()
                    .expect("two candidates");
                let s0 = state(start, on);
                depth[s0] = 0;
                let mut queue = VecDeque::from([s0]);
                while let Some(s) = queue.pop_front() {
                    let (cell, d) = (s / 9, (s % 9) as u8 + 1);
                    if depth[s] >= MAX_CHAIN_LINKS
                        || best.as_ref().is_some_and(|b| b.0.len() <= depth[s] + 1)
                    {
                        continue;
                    }
                    if d == z && depth[s] >= 2 {
                        let elims = self.seeing_both(start as u8, cell as u8, z);
                        if !elims.is_empty() {
                            let mut states = vec![s];
                            while let Some(p) = prev[*states.last().unwrap()] {
                                states.push(p);
                            }
                            states.reverse();
                            let cells: Vec<u8> = states.iter().map(|&x| (x / 9) as u8).collect();
                            if is_simple(&cells) {
                                let ons = states.iter().map(|&x| (x % 9) as u8 + 1).collect();
                                best = Some((cells, ons, elims, z));
                                continue;
                            }
                        }
                    }
                    for n in PEERS[cell].iter().map(|&p| p as usize) {
                        if bivalue(n) && self.cands[n] & bit(d) != 0 {
                            let next_on = digits(self.cands[n] & !bit(d))
                                .next()
                                .expect("two candidates");
                            let t = state(n, next_on);
                            if depth[t] == usize::MAX {
                                depth[t] = depth[s] + 1;
                                prev[t] = Some(s);
                                queue.push_back(t);
                            }
                        }
                    }
                }
            }
        }
        let (cells, ons, elims, z) = best?;
        let mut why = format!(
            "If {} isn't {z}, it is {}",
            cell_name(cells[0] as usize),
            ons[0]
        );
        for i in 1..cells.len() {
            let _ = write!(
                why,
                "; then {} isn't {}, so it is {}",
                cell_name(cells[i] as usize),
                ons[i - 1],
                ons[i]
            );
        }
        let (first, last) = (cells[0] as usize, *cells.last().unwrap() as usize);
        let digits_mask = cells.iter().fold(0, |m, &c| m | self.cands[c as usize]);
        Some(Step {
            technique: Technique::XYChain,
            place: None,
            explanation: format!(
                "XY-Chain: {why}. So {} or {} is {z}, and this {}.",
                cell_name(first),
                cell_name(last),
                elimination_text(&elims),
            ),
            eliminate: elims,
            cells,
            digits: digits_mask,
            unit: None,
        })
    }
}

/// Cells and strong-link units along an X-Chain, start first.
fn path(prev: &[Option<(usize, usize)>], end: usize, start: usize) -> (Vec<u8>, Vec<usize>) {
    let (mut cells, mut units) = (vec![(end / 2) as u8], Vec::new());
    let mut s = end;
    while s != start {
        let (p, unit) = prev[s].expect("every reached state has a parent");
        units.push(unit);
        cells.push((p / 2) as u8);
        s = p;
    }
    cells.reverse();
    units.reverse();
    (cells, units)
}

fn is_simple(cells: &[u8]) -> bool {
    cells
        .iter()
        .enumerate()
        .all(|(i, c)| !cells[i + 1..].contains(c))
}

/// All k-element index combinations of `0..n`, in lexicographic order.
fn combinations(n: usize, k: usize) -> Vec<Vec<usize>> {
    fn go(start: usize, n: usize, k: usize, cur: &mut Vec<usize>, out: &mut Vec<Vec<usize>>) {
        if cur.len() == k {
            out.push(cur.clone());
            return;
        }
        for i in start..n {
            cur.push(i);
            go(i + 1, n, k, cur, out);
            cur.pop();
        }
    }
    let mut out = Vec::new();
    go(0, n, k, &mut Vec::with_capacity(k), &mut out);
    out
}

/// The result of solving with techniques only, easiest first.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Logical {
    pub steps: Vec<Step>,
    /// Where the techniques stopped; complete when `solved`.
    pub board: Board,
    pub solved: bool,
}

pub fn solve_logically(grid: &Grid) -> Logical {
    let mut board = Board::new(grid);
    let mut steps = Vec::new();
    while !board.is_solved() {
        let Some(step) = board.next_step() else { break };
        board.apply(&step);
        steps.push(step);
    }
    Logical {
        solved: board.is_solved(),
        steps,
        board,
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Grade {
    pub difficulty: Difficulty,
    /// The hardest technique used; `None` if nothing was left to do.
    pub hardest: Option<Technique>,
    /// How many times each technique was used, in `Technique::ALL` order.
    pub uses: [u32; Technique::COUNT],
    pub steps: usize,
}

/// Grades a puzzle by the hardest technique an easiest-first solve needs. Meaningful for
/// puzzles with one solution; `Beyond` when the techniques run out.
pub fn grade(grid: &Grid) -> Grade {
    let logical = solve_logically(grid);
    let mut uses = [0u32; Technique::COUNT];
    for s in &logical.steps {
        uses[s.technique as usize] += 1;
    }
    let hardest = logical.steps.iter().map(|s| s.technique).max();
    let difficulty = if logical.solved {
        hardest.map_or(Difficulty::Easy, Technique::difficulty)
    } else {
        Difficulty::Beyond
    };
    Grade {
        difficulty,
        hardest,
        uses,
        steps: logical.steps.len(),
    }
}

/// Renders a step list as numbered lines, for logs and tests.
pub fn describe(steps: &[Step]) -> String {
    let mut out = String::new();
    for (i, s) in steps.iter().enumerate() {
        let _ = writeln!(out, "{}. {}", i + 1, s.explanation);
    }
    out
}

/// What the hint button says, checked in this order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Hint {
    /// Two placed digits clash.
    Conflict {
        pairs: Vec<(u8, u8)>,
    },
    /// The givens have no solution (0) or more than one (2 means "at least 2").
    NotUnique {
        solutions: u32,
    },
    /// Entries that differ from the unique solution.
    Mistakes {
        cells: Vec<u8>,
    },
    Solved,
    /// Deductions ending in a placement; every step before the last is needed for it.
    Steps(Vec<Step>),
    /// None of the techniques applies: a cell from the solution, the one with the fewest
    /// candidates.
    Reveal {
        cell: u8,
        digit: u8,
        candidates: u16,
    },
}

/// The next hint for a player at `current` (givens plus their entries) on `givens`.
/// Candidates come from the placed digits; the player's own pencil marks aren't used.
pub fn hint(givens: &Grid, current: &Grid) -> Hint {
    let pairs = current.conflicts();
    if !pairs.is_empty() {
        return Hint::Conflict { pairs };
    }
    let opts = crate::Options {
        max_solutions: 2,
        ..crate::Options::default()
    };
    let Ok(out) = crate::solve(givens, crate::Algorithm::Dlx, opts) else {
        return Hint::Conflict {
            pairs: givens.conflicts(),
        };
    };
    let solution = match (out.solutions, out.solution) {
        (1, Some(s)) => s,
        (n, _) => return Hint::NotUnique { solutions: n },
    };
    let mistakes: Vec<u8> = (0..81u8)
        .filter(|&c| {
            let d = current.0[c as usize];
            d != 0 && d != solution.0[c as usize]
        })
        .collect();
    if !mistakes.is_empty() {
        return Hint::Mistakes { cells: mistakes };
    }
    let mut board = Board::new(current);
    if board.is_solved() {
        return Hint::Solved;
    }
    let start = board;
    let mut steps = Vec::new();
    while let Some(step) = board.next_step() {
        board.apply(&step);
        let placed = step.place.is_some();
        steps.push(step);
        if placed {
            return Hint::Steps(prune(&start, steps));
        }
    }
    let cell = (0..81)
        .filter(|&c| board.cells[c] == 0)
        .min_by_key(|&c| board.cands[c].count_ones())
        .expect("not solved, so a cell is empty");
    Hint::Reveal {
        cell: cell as u8,
        digit: solution.0[cell],
        candidates: board.cands[cell],
    }
}

/// Drops elimination steps the final placement doesn't need, latest first. Eliminations
/// are facts whichever order they're applied in, so dropping one never invalidates another.
fn prune(start: &Board, mut steps: Vec<Step>) -> Vec<Step> {
    let last = steps.pop().expect("a chain ends in a placement");
    let (cell, d) = last.place.expect("the last step places");
    let holds = |kept: &[Step]| {
        let mut b = *start;
        for s in kept {
            b.apply(s);
        }
        match last.unit {
            Some(u) => b.spots(u as usize, d) == [cell],
            None => b.cands[cell as usize] == bit(d),
        }
    };
    let mut i = steps.len();
    while i > 0 {
        i -= 1;
        let removed = steps.remove(i);
        if !holds(&steps) {
            steps.insert(i, removed);
        }
    }
    steps.push(last);
    steps
}
