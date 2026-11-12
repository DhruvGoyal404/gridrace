import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/wasm", "public", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // With noUncheckedIndexedAccess, `!` on fixed 81-cell boards is the honest idiom.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  { files: ["scripts/**/*.mjs", "*.config.{js,ts}"], languageOptions: { globals: { ...globals.node } } },
  {
    // The service worker template; vite.config.ts fills in the two placeholders at build time.
    files: ["scripts/sw-template.js"],
    languageOptions: { globals: { ...globals.serviceworker, __PRECACHE__: "readonly" } },
  },
  {
    // Playwright: fixtures call `use`, which isn't React's; page.evaluate bodies run in the browser.
    files: ["e2e/**/*.ts", "scripts/shots.mjs", "scripts/bench-browser.mjs", "scripts/assets.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
);
