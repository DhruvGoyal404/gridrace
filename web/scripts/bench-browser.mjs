#!/usr/bin/env node
// Runs the Bench page in headless Chromium against a running build (npm run preview) and
// prints its table as markdown, for docs/BENCHMARKS.md.
//
//   node scripts/bench-browser.mjs [baseURL]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + "/bench");
await page.getByRole("button", { name: "Run the bench" }).click();
await page.getByRole("button", { name: "Run again" }).waitFor({ timeout: 30 * 60_000 });
const rows = await page.locator("main tbody tr").evaluateAll((trs) =>
  trs.map((tr) => [...tr.querySelectorAll("th, td")].map((c) => c.textContent.trim())),
);
const version = browser.version();
const isolated = await page.evaluate(() => crossOriginIsolated);
await browser.close();

console.log(`Chromium ${version} (headless), cross-origin isolated: ${isolated}\n`);
console.log("| Set | Solver | Browser median | Browser p95 | Native median | Browser ÷ native |");
console.log("|---|---|---:|---:|---:|---:|");
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
