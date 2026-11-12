#!/usr/bin/env node
// Checks DESIGN.md's colour tables against WCAG 2.1 AA in both themes, so the doc and the
// contract can't drift: body text 4.5:1, UI parts and focus rings 3:1.
//
//   node scripts/contrast.mjs [DESIGN.md]
import { readFileSync } from "node:fs";

/** Rows of a markdown table whose first cell is a backticked token. */
export function tokens(markdown) {
  const out = {};
  for (const line of markdown.split("\n")) {
    const m = /^\|\s*`(--?[\w-]+|[A-Z]{3})`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*`(#[0-9A-Fa-f]{6})`/.exec(line);
    if (m) out[m[1]] = { night: m[2], enamel: m[3] };
  }
  return out;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, backgrounds, minimum ratio, themes]
const TEXT = 4.5;
const UI = 3;
const PAIRS = [
  ["--ink", ["--ground", "--panel", "--flap"], TEXT],
  ["--ink-2", ["--ground", "--panel", "--flap"], TEXT],
  ["--placed", ["--flap"], TEXT],
  ["--danger", ["--ground", "--panel", "--flap"], TEXT],
  ["--on-signal", ["--signal"], TEXT],
  ["BRT", ["--panel", "--ground"], TEXT],
  ["BIT", ["--panel", "--ground"], TEXT],
  ["MRV", ["--panel", "--ground"], TEXT],
  ["DLX", ["--panel", "--ground"], TEXT],
  ["--focus", ["--ground", "--panel", "--flap"], UI],
  ["--box-rule", ["--flap"], UI],
  ["--signal", ["--ground", "--panel", "--flap"], UI, ["night"]],
];

export function check(t) {
  const failures = [];
  for (const [fg, bgs, min, themes = ["night", "enamel"]] of PAIRS) {
    for (const theme of themes) {
      for (const bg of bgs) {
        if (!t[fg] || !t[bg]) {
          failures.push(`missing token ${t[fg] ? bg : fg}`);
          continue;
        }
        const r = ratio(t[fg][theme], t[bg][theme]);
        if (r < min) failures.push(`${theme}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
      }
    }
  }
  return failures;
}

if (process.argv[1]?.endsWith("contrast.mjs")) {
  const failures = check(tokens(readFileSync(process.argv[2] ?? "DESIGN.md", "utf8")));
  for (const f of failures) console.error(`  ${f}`);
  console.log(failures.length === 0 ? "contrast: every pair meets WCAG AA" : `contrast: ${failures.length} failing pairs`);
  if (failures.length > 0) process.exit(1);
}
