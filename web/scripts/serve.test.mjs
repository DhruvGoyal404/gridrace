// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headersFor, parseHeaders } from "./serve.mjs";

describe("_headers", () => {
  const rules = parseHeaders(readFileSync(new URL("../public/_headers", import.meta.url), "utf8"));

  it("gives every path the strict CSP and cross-origin isolation", () => {
    const h = headersFor(rules, "/play");
    expect(h["Content-Security-Policy"]).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(h["Content-Security-Policy"]).toContain("style-src 'self';");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-inline");
    expect(h["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  });

  it("caches hashed assets forever and never the service worker", () => {
    expect(headersFor(rules, "/assets/index-abc.js")["Cache-Control"]).toContain("immutable");
    expect(headersFor(rules, "/sw.js")["Cache-Control"]).toBe("no-cache");
    expect(headersFor(rules, "/")["Cache-Control"]).toBeUndefined();
  });
});
