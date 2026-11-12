#!/usr/bin/env bash
# The full local gate (CLAUDE.md, "How we work"). Every commit passes it first.
# Fuzzing and cargo-deny run in CI only.
set -euo pipefail
cd "$(dirname "$0")/.."
# Windows: rust-analyzer can lock incremental files under target/debug mid-build.
export CARGO_INCREMENTAL=0

cargo fmt --all --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
cargo build -p gridrace-core --release --locked --target wasm32-unknown-unknown
cargo bench --locked --no-run
cargo run --release --locked -q -p gridrace-core --example corpus
git diff --exit-code data/
(cd fuzz && cargo check --locked)

node --test scripts/*.test.mjs
node scripts/check-workflows.mjs
node scripts/contrast.mjs
node scripts/check-deps.mjs . fuzz
echo "gate: all green"
