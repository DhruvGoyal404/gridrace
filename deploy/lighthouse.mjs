#!/usr/bin/env node
// Runs Lighthouse three times per preset (mobile, desktop) against a deployed URL and
// reports the median and range of each category, as Lighthouse's own docs recommend for
// variance. Prints markdown, and appends it to the GitHub job summary when there is one.
// Report only: it fails when a run can't be measured, never on a score.
//
//   node lighthouse.mjs https://gridrace.dhruvgoyal.tech/
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) throw new Error("usage: node lighthouse.mjs <url>");
const RUNS = 3;
const dir = mkdtempSync(join(tmpdir(), "lh-"));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

let out = `### Lighthouse ${url}\n\nMedian of ${RUNS} runs (range in brackets).\n\n| Preset | Performance | Accessibility | Best Practices | SEO | LCP | TBT | CLS |\n|---|---:|---:|---:|---:|---:|---:|---:|\n`;
let failed = false;
for (const preset of ["mobile", "desktop"]) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const path = join(dir, `${preset}-${i}.json`);
    execFileSync(
      process.execPath,
      [
        "node_modules/lighthouse/cli/index.js",
        url,
        ...(preset === "desktop" ? ["--preset=desktop"] : []),
        "--quiet",
        "--chrome-flags=--headless=new --no-sandbox",
        "--output=json",
        `--output-path=${path}`,
      ],
      { stdio: "inherit" },
    );
    const report = JSON.parse(readFileSync(path, "utf8"));
    const scores = Object.fromEntries(Object.entries(report.categories).map(([k, c]) => [k, c.score]));
    if (report.runtimeError || Object.values(scores).some((s) => s === null)) {
      console.error(`${preset} run ${i + 1}: ${report.runtimeError?.message ?? "a category has no score"}`);
      failed = true;
      continue;
    }
    const a = report.audits;
    runs.push({
      ...Object.fromEntries(Object.entries(scores).map(([k, s]) => [k, Math.round(s * 100)])),
      lcp: a["largest-contentful-paint"].numericValue,
      tbt: a["total-blocking-time"].numericValue,
      cls: a["cumulative-layout-shift"].numericValue,
    });
  }
  if (runs.length === 0) continue;
  const cell = (key, fmt = (v) => v) => {
    const vs = runs.map((r) => r[key]);
    const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
    return lo === hi ? `${fmt(median(vs))}` : `${fmt(median(vs))} (${fmt(lo)}–${fmt(hi)})`;
  };
  out += `| ${preset} | ${cell("performance")} | ${cell("accessibility")} | ${cell("best-practices")} | ${cell("seo")} | ${cell("lcp", (v) => `${(v / 1000).toFixed(1)} s`)} | ${cell("tbt", (v) => `${Math.round(v)} ms`)} | ${cell("cls", (v) => v.toFixed(3))} |\n`;
}
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
if (failed) process.exit(1);
