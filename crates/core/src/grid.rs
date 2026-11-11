use std::fmt;

/// A 9x9 grid in row-major order. `0` is an empty cell, `1..=9` a digit.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct Grid(pub [u8; 81]);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ParseError {
    /// A character other than `1-9`, `0`, `.` or whitespace, at this index of the input.
    InvalidChar { index: usize, ch: char },
    /// Not exactly 81 cells after whitespace is removed. Stops counting at 82.
    WrongLength { cells: usize },
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidChar { index, ch } => write!(
                f,
                "character {ch:?} at position {} is not a digit, '0' or '.'",
                index + 1
            ),
            Self::WrongLength { cells } if *cells > 81 => {
                write!(f, "more than 81 cells; a puzzle has exactly 81")
            }
            Self::WrongLength { cells } => {
                write!(f, "{cells} cells; a puzzle has exactly 81")
            }
        }
    }
}

impl std::error::Error for ParseError {}

pub const fn row(cell: usize) -> usize {
    cell / 9
}
pub const fn col(cell: usize) -> usize {
    cell % 9
}
pub const fn box_of(cell: usize) -> usize {
    (cell / 27) * 3 + (cell % 9) / 3
}
pub const fn are_peers(a: usize, b: usize) -> bool {
    a != b && (row(a) == row(b) || col(a) == col(b) || box_of(a) == box_of(b))
}

/// The 27 units: rows 0-8, columns 9-17, boxes 18-26.
pub const UNITS: [[u8; 9]; 27] = {
    let mut units = [[0u8; 9]; 27];
    let mut i = 0;
    while i < 9 {
        let mut j = 0;
        while j < 9 {
            units[i][j] = (i * 9 + j) as u8;
            units[9 + i][j] = (j * 9 + i) as u8;
            units[18 + i][j] = ((i / 3) * 27 + (i % 3) * 3 + (j / 3) * 9 + j % 3) as u8;
            j += 1;
        }
        i += 1;
    }
    units
};

impl Grid {
    pub const EMPTY: Grid = Grid([0; 81]);

    /// Parses 81 cells: `1-9` are digits, `0` and `.` are empty, whitespace is ignored.
    pub fn parse(input: &str) -> Result<Grid, ParseError> {
        let mut cells = [0u8; 81];
        let mut n = 0;
        for (index, ch) in input.chars().enumerate() {
            let value = match ch {
                '1'..='9' => ch as u8 - b'0',
                '0' | '.' => 0,
                c if c.is_whitespace() => continue,
                _ => return Err(ParseError::InvalidChar { index, ch }),
            };
            if n == 81 {
                return Err(ParseError::WrongLength { cells: 82 });
            }
            cells[n] = value;
            n += 1;
        }
        if n == 81 {
            Ok(Grid(cells))
        } else {
            Err(ParseError::WrongLength { cells: n })
        }
    }

    pub fn givens(&self) -> usize {
        self.0.iter().filter(|&&d| d != 0).count()
    }

    /// Pairs of cells `(a, b)`, `a < b`, that hold the same digit in a shared unit.
    pub fn conflicts(&self) -> Vec<(u8, u8)> {
        let mut out = Vec::new();
        for unit in &UNITS {
            for (i, &a) in unit.iter().enumerate() {
                for &b in &unit[i + 1..] {
                    let d = self.0[a as usize];
                    if d != 0 && d == self.0[b as usize] {
                        out.push((a.min(b), a.max(b)));
                    }
                }
            }
        }
        // Two cells can share a row and a box: report the pair once.
        out.sort_unstable();
        out.dedup();
        out
    }

    /// Complete, every unit a permutation of 1-9, and every given of `puzzle` kept.
    pub fn solves(&self, puzzle: &Grid) -> bool {
        let units_ok = UNITS.iter().all(|unit| {
            let mask = unit
                .iter()
                .fold(0u16, |m, &c| m | (1 << self.0[c as usize]));
            mask == 0b11_1111_1110
        });
        units_ok
            && puzzle
                .0
                .iter()
                .zip(self.0.iter())
                .all(|(&p, &s)| p == 0 || p == s)
    }
}

impl fmt::Display for Grid {
    /// 81 characters, `.` for empty: the same format `parse` reads.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for &d in &self.0 {
            f.write_str(if d == 0 {
                "."
            } else {
                &"123456789"[d as usize - 1..d as usize]
            })?;
        }
        Ok(())
    }
}

impl fmt::Debug for Grid {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Grid({self})")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units_cover_every_cell_three_times() {
        let mut seen = [0; 81];
        for unit in UNITS {
            for c in unit {
                seen[c as usize] += 1;
            }
        }
        assert!(seen.iter().all(|&n| n == 3));
        assert_eq!(UNITS[18 + 4], [30, 31, 32, 39, 40, 41, 48, 49, 50]);
    }

    #[test]
    fn parse_round_trips_and_accepts_both_empty_markers() {
        let s = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
        let g = Grid::parse(s).unwrap();
        assert_eq!(g.to_string(), s);
        assert_eq!(Grid::parse(&s.replace('.', "0")).unwrap(), g);
        let spaced: String = s
            .chars()
            .enumerate()
            .flat_map(|(i, c)| [c, if i % 9 == 8 { '\n' } else { ' ' }])
            .collect();
        assert_eq!(Grid::parse(&spaced).unwrap(), g);
        assert_eq!(g.givens(), 30);
    }

    #[test]
    fn parse_errors_name_the_problem() {
        assert_eq!(
            Grid::parse("12x"),
            Err(ParseError::InvalidChar { index: 2, ch: 'x' })
        );
        assert_eq!(
            Grid::parse("123"),
            Err(ParseError::WrongLength { cells: 3 })
        );
        assert_eq!(
            Grid::parse(&"1".repeat(500)),
            Err(ParseError::WrongLength { cells: 82 })
        );
        assert_eq!(
            Grid::parse(&"1".repeat(80)).unwrap_err().to_string(),
            "80 cells; a puzzle has exactly 81"
        );
    }

    #[test]
    fn conflicts_reports_each_pair_once() {
        let mut g = Grid::EMPTY;
        g.0[0] = 5;
        g.0[1] = 5; // same row and same box: still one pair
        g.0[80] = 5; // no shared unit with either
        assert_eq!(g.conflicts(), vec![(0, 1)]);
    }
}
