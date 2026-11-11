pub mod bitmask;
pub mod brute;
pub mod dlx;
pub mod mrv;

/// Bit `d - 1` set for each digit `d` already used in a row, column or box.
#[derive(Clone, Copy)]
pub struct Masks {
    pub row: [u16; 9],
    pub col: [u16; 9],
    pub bx: [u16; 9],
}

pub const ALL_DIGITS: u16 = 0x1FF;

impl Masks {
    pub fn of(cells: &[u8; 81]) -> Self {
        let mut m = Masks {
            row: [0; 9],
            col: [0; 9],
            bx: [0; 9],
        };
        for (c, &d) in cells.iter().enumerate() {
            if d != 0 {
                m.toggle(c, d);
            }
        }
        m
    }

    /// Digits still legal in `cell`.
    #[inline]
    pub fn free(&self, cell: usize) -> u16 {
        !(self.row[crate::row(cell)] | self.col[crate::col(cell)] | self.bx[crate::box_of(cell)])
            & ALL_DIGITS
    }

    /// Sets or clears digit `d` for the cell's three units (XOR: the same call undoes it).
    #[inline]
    pub fn toggle(&mut self, cell: usize, d: u8) {
        let bit = 1 << (d - 1);
        self.row[crate::row(cell)] ^= bit;
        self.col[crate::col(cell)] ^= bit;
        self.bx[crate::box_of(cell)] ^= bit;
    }
}

/// Digits in a mask, lowest first.
pub fn digits(mut mask: u16) -> impl Iterator<Item = u8> {
    std::iter::from_fn(move || {
        (mask != 0).then(|| {
            let d = mask.trailing_zeros() as u8 + 1;
            mask &= mask - 1;
            d
        })
    })
}
