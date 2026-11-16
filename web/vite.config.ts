/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/** Preloads the Latin face, so text paints once in Archivo instead of repainting on swap. */
function preloadFont(): Plugin {
  return {
    name: "gridrace-preload-font",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      const font = Object.keys(ctx.bundle ?? {}).find((f) => /archivo-latin-wdth-normal.*\.woff2$/.test(f));
      if (!font) throw new Error("preload-font: the Archivo Latin file is missing from the bundle");
      return [{ tag: "link", attrs: { rel: "preload", href: `/${font}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" }];
    },
  };
}

/**
 * One HTML file per route plus 404.html, from the built index.html. Cloudflare Pages serves
 * /play from play.html and any unknown path from 404.html with status 404 (a top-level
 * 404.html also turns off its single-page fallback). Each file gets its own title,
 * description and canonical URL; 404.html is noindex. web/scripts/serve.mjs does the same.
 */
function routePages(): Plugin {
  const SITE = "https://gridrace.dhruvgoyal.tech";
  const pages = [
    { file: "play.html", path: "/play", title: "Play Sudoku with explained hints | GridRace", description: "Play Sudoku with notes, undo, a mistakes check and a hint ladder that explains why each digit is forced, from hidden singles to X-Chains." },
    { file: "bench.html", path: "/bench", title: "In-browser benchmark | GridRace", description: "Time four Sudoku solvers, compiled to WebAssembly, on the benchmark corpus in your own browser, next to the native Rust medians." },
    { file: "404.html", path: null, title: "Page not found | GridRace", description: "No such page on GridRace." },
  ];
  return {
    name: "gridrace-route-pages",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir ?? "dist";
      const index = readFileSync(join(dir, "index.html"), "utf8");
      for (const p of pages) {
        let html = index
          .replace(/<title>[^<]*<\/title>/, `<title>${p.title}</title>`)
          .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${p.description}$2`)
          .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${p.title}$2`);
        html = p.path
          ? html
              .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${SITE}${p.path}$2`)
              .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}${p.path}$2`)
          : html.replace(/\s*<link rel="canonical"[^>]*>/, "").replace("<head>", '<head>\n    <meta name="robots" content="noindex" />');
        writeFileSync(join(dir, p.file), html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker(), preloadFont(), routePages()],
  worker: { format: "es" },
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: "es2022" },
  test: {
    // Threads, not forked processes: forking timed out on a memory-starved dev machine.
    pool: "threads",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
