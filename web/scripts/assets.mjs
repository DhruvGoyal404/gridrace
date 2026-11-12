#!/usr/bin/env node
// Renders the raster assets from HTML in Playwright's Chromium, so they are reproducible
// and drawn in the app's own type and palette: app icons (192, 512, maskable 512) and the
// Open Graph image (1200 x 630). Numbers on the OG image are the native Easy medians from
// docs/BENCHMARKS.md, labelled as such.
//
//   node scripts/assets.mjs   (writes web/public/*.png)
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const font = readFileSync(`${web}node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2`).toString("base64");
const BASE = `
  @font-face { font-family: Archivo; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
  * { margin: 0; box-sizing: border-box; }
  body { background: #0b0c0e; color: #ecedea; font-family: Archivo, sans-serif; font-variant-numeric: tabular-nums; }
  .tile { position: relative; background: #1c1f24; display: grid; place-items: center; font-stretch: 75%; font-weight: 700; }
  .tile::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: #0b0c0e; z-index: 0; }
  .tile > span { position: relative; z-index: 1; }`;

function icon(size, pad) {
  const inner = size - pad * 2;
  return `<style>${BASE} body { width: ${size}px; height: ${size}px; display: grid; place-items: center; }</style>
    <div class="tile" style="width:${inner}px;height:${inner}px;border-radius:${inner * 0.06}px;font-size:${inner * 0.78}px;color:#f5c400"><span>G</span></div>`;
}

const LANES = [
  ["BRT", "Brute force", "3.26 ms", "164,517", "#ff7a59", 0.86],
  ["BIT", "Bitmask", "447 µs", "164,517", "#b9a2ff", 0.86],
  ["MRV", "MRV + propagation", "12.0 µs", "56", "#3fd0c0", 0.24],
  ["DLX", "Dancing Links", "29.5 µs", "56", "#7ab0ff", 0.24],
];

const og = `<style>${BASE}
  body { width: 1200px; height: 630px; padding: 64px 72px; display: grid; grid-template-rows: auto auto 1fr auto; gap: 28px; }
  .mark { display: flex; gap: 6px; }
  .mark .tile { width: 40px; height: 52px; font-size: 38px; background: #ecedea; color: #0b0c0e; }
  .mark .tile::after { display: none; }
  h1 { font-size: 64px; line-height: 1.02; font-weight: 800; font-stretch: 87.5%; letter-spacing: -0.01em; max-width: 1000px; }
  .lanes { display: grid; align-content: start; border-top: 2px solid #2a2e35; }
  .lane { display: grid; grid-template-columns: 96px 300px 1fr 170px 150px; align-items: center; gap: 24px; height: 66px; border-bottom: 2px solid #2a2e35; font-size: 26px; }
  .code { font-stretch: 75%; font-weight: 800; font-size: 32px; }
  .bar { height: 10px; background: #2a2e35; }
  .bar span { display: block; height: 100%; }
  .time { font-stretch: 75%; font-weight: 700; font-size: 34px; text-align: right; }
  .nodes { color: #a6abb4; font-stretch: 75%; text-align: right; }
  .foot { display: flex; justify-content: space-between; color: #a6abb4; font-size: 22px; }
  .foot b { color: #f5c400; font-weight: 700; }
</style>
<div class="mark">${"GRIDRACE".split("").map((c) => `<div class="tile"><span>${c}</span></div>`).join("")}</div>
<h1>Four Sudoku solvers. One puzzle. Every node counted.</h1>
<div class="lanes">${LANES.map(([code, name, time, nodes, hue, w]) => `
  <div class="lane"><span class="code" style="color:${hue}">${code}</span><span>${name}</span>
  <span class="bar"><span style="width:${w * 100}%;background:${hue}"></span></span>
  <span class="time">${time}</span><span class="nodes">${nodes} nodes</span></div>`).join("")}
</div>
<div class="foot"><span>Median per Easy puzzle, native Rust, one core. Measured again in your browser.</span><b>gridrace.dhruvgoyal.tech</b></div>`;

const browser = await chromium.launch();
const shots = [
  ["icon-192.png", icon(192, 12), 192, 192],
  ["icon-512.png", icon(512, 32), 512, 512],
  // Maskable: the platform may crop to a circle, so the mark sits inside the 80% safe zone.
  ["icon-maskable-512.png", icon(512, 72), 512, 512],
  ["og.png", og, 1200, 630],
];
for (const [name, html, width, height] of shots) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${web}public/${name}` });
  await page.close();
}
await browser.close();
console.log("assets: wrote public/icon-192.png, icon-512.png, icon-maskable-512.png, og.png");
