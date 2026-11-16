#!/usr/bin/env node
// Serves web/dist the way Cloudflare Pages will: the headers from dist/_headers, a file if
// one matches, then <path>.html (pretty URLs: /play -> play.html), and otherwise 404.html
// with status 404. The e2e suite runs against this, so the strict CSP, cross-origin
// isolation and the 404 page are tested before deploy.
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

const isFile = (f) => f.startsWith(dist) && existsSync(f) && statSync(f).isFile();

/** The file Pages would serve for a path: exact file, index.html at /, <path>.html, else 404.html. */
export function resolve(path) {
  if (path === "/") return join(dist, "index.html");
  const exact = normalize(join(dist, path));
  if (isFile(exact)) return exact;
  const pretty = normalize(join(dist, `${path.replace(/\/+$/, "")}.html`));
  if (isFile(pretty)) return pretty;
  return join(dist, "404.html");
}

if (process.argv[1]?.endsWith("serve.mjs")) {
  const rules = parseHeaders(readFileSync(join(dist, "_headers"), "utf8"));
  createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = resolve(path);
    const status = file === join(dist, "404.html") ? 404 : 200;
    res.writeHead(status, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", ...headersFor(rules, path) });
    createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`serving dist on http://localhost:${port}`));
}
