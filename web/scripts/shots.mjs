#!/usr/bin/env node
// Captures review screenshots of a running build (npm run preview) and fails on console
// errors. Desktop 1440 and phone 390, both boards, for landing, Race mid-replay, Play with a
// hint open, and Bench.
//
//   node scripts/shots.mjs [baseURL] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:4173";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const THEMES = ["night", "enamel"];
const errors = [];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor ?? 1,
      colorScheme: theme === "night" ? "dark" : "light",
    });
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${vp.name}/${theme}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${vp.name}/${theme}: ${e.message}`));
    const shot = (name, fullPage = false) => page.screenshot({ path: join(out, `${name}-${vp.name}-${theme}.png`), fullPage });

    // Landing: the race in its first viewport, full page for the explainer below.
    await page.goto(base + "/");
    await page.getByText("All arrived").waitFor({ timeout: 60_000 });
    if (!(await page.evaluate(() => crossOriginIsolated))) errors.push(`${vp.name}/${theme}: not cross-origin isolated`);
    await page.waitForTimeout(400);
    await shot("landing", true);

    // Race mid-replay: brute force's search, paused part way.
    await page.getByRole("radio", { name: /BRT/ }).click();
    // Seek to the middle of the trace (React listens for "input", so set the value natively).
    await page.getByLabel("Replay position").evaluate((el) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(el, String(Math.floor(Number(el.max) / 2)));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.locator("#main").scrollIntoViewIfNeeded();
    await shot("race-replay");

    // Play with a hint at the "why" rung.
    await page.goto(base + "/play");
    await page.getByRole("grid").waitFor({ timeout: 60_000 });
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^(Give me a hint|Show where to look|Show why)$/ }).click();
      await page.waitForTimeout(250);
    }
    await shot("play-hint");
    if (vp.name === "phone") {
      await page.getByRole("heading", { name: "Hint" }).scrollIntoViewIfNeeded();
      await shot("play-hint-panel");
    }

    await page.goto(base + "/bench");
    await page.getByRole("button", { name: "Run the bench" }).waitFor();
    await shot("bench");
    await context.close();
  }
}
await browser.close();
for (const e of errors) console.error(e);
console.log(errors.length ? `${errors.length} console errors` : `shots: saved to ${out}, no console errors`);
process.exit(errors.length ? 1 : 0);
