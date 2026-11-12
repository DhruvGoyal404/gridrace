#!/usr/bin/env node
// Builds crates/wasm for the browser and copies the benchmark corpus beside the app:
//   cargo build (wasm32, release) -> wasm-bindgen --target web -> web/src/wasm/
//   data/*.txt -> web/public/data/
// wasm-bindgen-cli must match the crate's pinned wasm-bindgen exactly (crates/wasm/Cargo.toml).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(web, "..");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

const pinned = /wasm-bindgen = "=([\d.]+)"/.exec(readFileSync(join(root, "crates/wasm/Cargo.toml"), "utf8"))[1];
const cli = execFileSync("wasm-bindgen", ["--version"], { encoding: "utf8" }).trim().split(" ")[1];
if (cli !== pinned) {
  console.error(`wasm-bindgen CLI is ${cli}, the crate pins ${pinned}: cargo install wasm-bindgen-cli --version ${pinned} --locked`);
  process.exit(1);
}

run("cargo", ["build", "--release", "--locked", "-p", "gridrace-wasm", "--target", "wasm32-unknown-unknown"]);
run("wasm-bindgen", [
  "--target", "web",
  "--out-dir", join(web, "src/wasm"),
  "--typescript",
  join(root, "target/wasm32-unknown-unknown/release/gridrace_wasm.wasm"),
]);

const data = join(web, "public/data");
mkdirSync(data, { recursive: true });
for (const file of readdirSync(join(root, "data")).filter((f) => f.endsWith(".txt"))) {
  copyFileSync(join(root, "data", file), join(data, file));
}
console.log("wasm: built web/src/wasm, copied data/*.txt to web/public/data");
