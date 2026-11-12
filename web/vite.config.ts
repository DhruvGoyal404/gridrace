/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// Cross-origin isolation gives performance.now() its fine resolution (about 5 µs instead
// of 100 µs), which the race timings need. Production sends the same headers (public/_headers).
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/** Emits sw.js with every built file in its precache list, versioned by their hashes. */
function serviceWorker(): Plugin {
  return {
    name: "gridrace-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      const fromPublic = ["favicon.svg", "manifest.webmanifest", "icon-192.png", "icon-512.png"].concat(
        readdirSync("public/data").map((f) => `data/${f}`),
      );
      const files = ["/", ...[...built, ...fromPublic].map((f) => `/${f}`)].sort();
      const version = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      const source = readFileSync("scripts/sw-template.js", "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(files, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  worker: { format: "es" },
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
