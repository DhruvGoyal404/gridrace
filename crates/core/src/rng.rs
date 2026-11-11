//! `SplitMix64`: tiny, seedable and identical on every platform, so a seed names a puzzle
//! forever. Not for cryptography.

#[derive(Clone, Debug)]
pub struct Rng(u64);

impl Rng {
    pub const fn new(seed: u64) -> Self {
        Self(seed)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `0..n` (Lemire's multiply-shift; the bias is below 2^-58 for n <= 81).
    pub fn below(&mut self, n: usize) -> usize {
        ((u128::from(self.next_u64()) * n as u128) >> 64) as usize
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            items.swap(i, self.below(i + 1));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Rng;

    #[test]
    fn matches_the_reference_sequence() {
        // First outputs of SplitMix64 seeded with 0, from the reference C implementation.
        let mut r = Rng::new(0);
        assert_eq!(r.next_u64(), 0xE220_A839_7B1D_CDAF);
        assert_eq!(r.next_u64(), 0x6E78_9E6A_A1B9_65F4);
    }

    #[test]
    fn below_stays_in_range_and_hits_every_value() {
        let mut r = Rng::new(7);
        let mut seen = [false; 9];
        for _ in 0..1000 {
            seen[r.below(9)] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }
}
