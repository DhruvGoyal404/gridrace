#!/usr/bin/env node
// Serves web/dist the way Cloudflare Pages will: the headers from dist/_headers, and
// index.html for any path that isn't a file (single-page routes). The e2e suite runs
// against this, so the strict CSP and cross-origin isolation are tested before deploy.
//
//   node scripts/serve.mjs [port]
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.argv[2] ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/** Rules from _headers: [{ pattern, headers }], pattern "/*" or "/prefix/*" or exact. */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} });
    else {
      const i = line.indexOf(":");
      rules.at(-1).headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

export function headersFor(rules, path) {
  const out = {};
  for (const { pattern, headers } of rules) {
    const match = pattern.endsWith("/*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
    if (match) Object.assign(out, headers);
  }
  return out;
}

if (process.argv[1]?.endsWith("serve.mjs")) {
  const rules = parseHeaders(readFileSync(join(dist, "_headers"), "utf8"));
  createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(dist, path));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", ...headersFor(rules, path) });
    createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`serving dist on http://localhost:${port}`));
}
