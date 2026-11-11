#!/usr/bin/env node
// Enforces the dependency rules in CLAUDE.md across every ecosystem we use: exact pins,
// and every package at least 14 days old unless docs/DEPENDENCY_EXCEPTIONS.md covers it.
// Any exception past its expiry date fails, whether or not it's still needed.
// With --audit, each npm directory's `npm audit` findings must all be listed under "Accepted
// advisories" in the same file; a listed advisory that no longer appears fails too, so the
// entry goes as soon as the fix is in.
//
//   node scripts/check-deps.mjs [--now 2026-11-12] [--times fixture.json] [--exceptions file] [--audit] dir...
//
// A directory with Cargo.lock is checked as Rust crates, one with package-lock.json as npm.
// The Rust toolchain (rust-toolchain.toml) and any dated nightly named in a workflow are
// checked too. Adding an ecosystem means adding it to ECOSYSTEMS and a reader below.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DAY_MS = 86_400_000;
const MIN_AGE_DAYS = 14;
const ECOSYSTEMS = new Set(["npm", "crates", "rust-toolchain"]);
// A plain date runs to the end of that day, UTC. A timestamp is exact.
const EXPIRY = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/;
const expiryTime = (expires) => new Date(expires.includes("T") ? expires : `${expires}T23:59:59Z`);

const ACCEPTED = "## Accepted advisories";

/** Reads the table. Anything that looks like a row but can't be read is an error. */
export function parseExceptions(markdown) {
  const rows = [];
  const errors = [];
  for (const line of markdown.split(ACCEPTED)[0].split("\n")) {
    if (!line.startsWith("|") || /^\|[\s:|-]+\|?$/.test(line) || /^\|\s*Ecosystem\b/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const [ecosystem, name, version, , advisory, , expires] = cells;
    if (cells.length !== 7 || !ECOSYSTEMS.has(ecosystem) || !EXPIRY.test(expires ?? "") || !advisory) {
      errors.push(`exceptions table: can't read "${line}"`);
      continue;
    }
    rows.push({ ecosystem, name, version, advisory, expires });
  }
  return { rows, errors };
}

/** The accepted-advisories table: | Where | Package | Advisory | Recorded | Expires |. */
export function parseAccepted(markdown) {
  const rows = [];
  const errors = [];
  const section = markdown.split(ACCEPTED)[1] ?? "";
  for (const line of section.split("\n")) {
    if (!line.startsWith("|") || /^\|[\s:|-]+\|?$/.test(line) || /^\|\s*Where\b/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const [where, name, advisory, , expires] = cells;
    if (cells.length !== 5 || !where || !name || !/^GHSA-[\w-]+$/.test(advisory ?? "") || !EXPIRY.test(expires ?? "")) {
      errors.push(`accepted advisories table: can't read "${line}"`);
      continue;
    }
    rows.push({ ecosystem: "npm", where, name, version: advisory, advisory, expires });
  }
  return { rows, errors };
}

/**
 * Pure: one directory's `npm audit --json` against the accepted rows. Every finding must be
 * accepted for that directory, and every accepted row must still be a finding.
 */
export function auditErrors({ dir, audit, accepted }) {
  const errors = [];
  const found = new Set();
  for (const vulnerability of Object.values(audit.vulnerabilities ?? {})) {
    // String entries name the dependency that carries the advisory; it's reported there.
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object") continue;
      const advisory = /GHSA-[\w-]+/.exec(via.url ?? "")?.[0] ?? `npm-${String(via.source)}`;
      found.add(`${via.name} ${advisory}`);
      if (!accepted.some((row) => row.where === dir && row.name === via.name && row.advisory === advisory)) {
        errors.push(`${dir}: ${via.name} ${advisory} (${via.severity}) is not an accepted advisory`);
      }
    }
  }
  for (const row of accepted.filter((r) => r.where === dir && !found.has(`${r.name} ${r.advisory}`))) {
    errors.push(`${dir}: ${row.name} ${row.advisory} no longer appears in npm audit; remove the accepted entry`);
  }
  return errors;
}

export function expiredExceptions(rows, now) {
  const nowDate = new Date(now);
  return rows
    .filter((row) => expiryTime(row.expires) < nowDate)
    .map(
      (row) =>
        `${row.ecosystem} ${row.name}@${row.version}: exception expired on ${row.expires}; remove it or fix the dependency`,
    );
}

export function npmItems(lock) {
  const out = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === "" || !entry.version || entry.link) continue;
    const name = entry.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    out.push({ ecosystem: "npm", name, version: entry.version });
  }
  return out;
}

export function npmPinErrors(pkg) {
  const errors = [];
  for (const field of ["dependencies", "devDependencies"]) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (!/^\d+\.\d+\.\d+$/.test(spec)) errors.push(`${name}: ${spec} is not an exact pin`);
    }
  }
  return errors;
}

/** Every crates.io package in a Cargo.lock, transitive ones included. Path crates are ours. */
export function cratesItems(lock) {
  const items = [];
  for (const block of lock.split("[[package]]").slice(1)) {
    const field = (key) => new RegExp(`^${key} = "([^"]+)"`, "m").exec(block)?.[1];
    if (field("source")?.startsWith("registry+")) {
      items.push({ ecosystem: "crates", name: field("name"), version: field("version") });
    }
  }
  return items;
}

/** Registry dependencies in a Cargo.toml must be `=x.y.z`. Path-only dependencies are ours. */
export function cratesPinErrors(manifest) {
  const errors = [];
  let inDeps = false;
  for (const raw of manifest.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line.startsWith("[")) {
      inDeps = /^\[(?:.*\.)?(?:dev-|build-)?dependencies\]$/.test(line);
      continue;
    }
    const dep = inDeps ? /^([\w-]+)\s*=\s*(.+)$/.exec(line) : null;
    if (!dep) continue;
    const [, name, spec] = dep;
    const version = /^"([^"]*)"$/.exec(spec)?.[1] ?? /version\s*=\s*"([^"]*)"/.exec(spec)?.[1];
    if (version === undefined && /path\s*=/.test(spec)) continue;
    if (!/^=\d+\.\d+\.\d+$/.test(version ?? "")) errors.push(`${name}: ${version ?? spec} is not an exact pin (=x.y.z)`);
  }
  return errors;
}

/** The pinned stable toolchain, and every dated nightly a workflow installs. */
export function rustItems(toolchainToml, workflows) {
  const items = [];
  const channel = /^channel\s*=\s*"([^"]+)"/m.exec(toolchainToml)?.[1];
  if (channel) items.push({ ecosystem: "rust-toolchain", name: "rust", version: channel });
  for (const nightly of new Set(workflows.match(/nightly-\d{4}-\d{2}-\d{2}/g) ?? [])) {
    items.push({ ecosystem: "rust-toolchain", name: "rust", version: nightly });
  }
  return items;
}

/** Pure, so the fixtures in scripts/check-deps.test.mjs can drive every failure. */
export function ageErrors({ items, times, exceptions, now }) {
  const errors = [];
  const used = new Set();
  const nowDate = new Date(now);
  for (const { ecosystem, name, version } of items) {
    const key = `${name}@${version}`;
    const published = times[ecosystem]?.[name]?.[version];
    if (!published) {
      errors.push(`${ecosystem} ${key}: no publish date found`);
      continue;
    }
    if ((nowDate - new Date(published)) / DAY_MS >= MIN_AGE_DAYS) continue;
    const exception = exceptions.find(
      (e) => e.ecosystem === ecosystem && e.name === name && e.version === version,
    );
    if (exception) used.add(`${ecosystem} ${key}`);
    else errors.push(`${ecosystem} ${key}: published ${published.slice(0, 10)}, under ${MIN_AGE_DAYS} days old`);
  }
  return { errors, used: [...used] };
}

async function getJson(url, text = false) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // crates.io asks automated clients to say who they are.
      const response = await fetch(url, { headers: { "User-Agent": "gridrace-check-deps (+https://github.com/DhruvGoyal404/gridrace)" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return text ? await response.text() : await response.json();
    } catch (error) {
      if (attempt === 3) throw new Error(`${url}: ${error.message}`, { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function publishTime({ ecosystem, name, version }) {
  if (ecosystem === "npm") {
    return (await getJson(`https://registry.npmjs.org/${name.replace("/", "%2f")}`)).time;
  }
  if (ecosystem === "crates") {
    const { versions } = await getJson(`https://crates.io/api/v1/crates/${name}`);
    return Object.fromEntries(versions.map((v) => [v.num, v.created_at]));
  }
  // A nightly's date is in its name; a stable release's is in its channel manifest.
  const dated = /^nightly-(\d{4}-\d{2}-\d{2})$/.exec(version)?.[1];
  const manifest = dated ? "" : await getJson(`https://static.rust-lang.org/dist/channel-rust-${version}.toml`, true);
  const date = dated ?? /^date = "([^"]+)"/m.exec(manifest)?.[1];
  return { [version]: date && `${date}T00:00:00Z` };
}

async function fetchTimes(items) {
  const times = {};
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.pop(); item; item = queue.pop()) {
      const byName = (times[item.ecosystem] ??= {});
      if (item.ecosystem !== "rust-toolchain" && byName[item.name]) continue;
      // Merge in place: another worker may be filling other versions of the same name.
      Object.assign((byName[item.name] ??= {}), await publishTime(item));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return times;
}

/** The Cargo.toml files of a Cargo directory: the root and any workspace members under crates/. */
function manifests(dir) {
  const crates = join(dir, "crates");
  const members = existsSync(crates) ? readdirSync(crates).map((c) => join(crates, c, "Cargo.toml")) : [];
  return [join(dir, "Cargo.toml"), ...members].filter((f) => existsSync(f));
}

async function main() {
  const args = process.argv.slice(2);
  const option = (flag) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args.splice(index, 2)[1];
  };
  const now = option("--now") ?? new Date().toISOString();
  const timesFile = option("--times");
  const exceptionsFile = option("--exceptions") ?? "docs/DEPENDENCY_EXCEPTIONS.md";

  const audit = args.includes("--audit");
  if (audit) args.splice(args.indexOf("--audit"), 1);
  const markdown = readFileSync(exceptionsFile, "utf8");
  const { rows, errors: tableErrors } = parseExceptions(markdown);
  const { rows: accepted, errors: acceptedErrors } = parseAccepted(markdown);
  const problems = [...tableErrors, ...acceptedErrors, ...expiredExceptions([...rows, ...accepted], now)];

  const checks = [];
  const workflows = readdirSync(".github/workflows").map((f) => readFileSync(join(".github/workflows", f), "utf8"));
  checks.push({ label: "rust toolchain", items: rustItems(readFileSync("rust-toolchain.toml", "utf8"), workflows.join("\n")) });
  for (const dir of args) {
    if (existsSync(join(dir, "Cargo.lock"))) {
      for (const manifest of manifests(dir)) problems.push(...cratesPinErrors(readFileSync(manifest, "utf8")).map((e) => `${manifest}: ${e}`));
      checks.push({ label: dir, items: cratesItems(readFileSync(join(dir, "Cargo.lock"), "utf8")) });
    } else {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      problems.push(...npmPinErrors(pkg));
      checks.push({ label: dir, items: npmItems(JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"))), npmDir: dir });
    }
  }
  for (const { label, items, npmDir } of checks) {
    const times = timesFile ? JSON.parse(readFileSync(timesFile, "utf8")) : await fetchTimes(items);
    const { errors, used } = ageErrors({ items, times, exceptions: rows, now });
    console.log(`${label}: ${items.length} packages, exceptions in use: ${used.join(", ") || "none"}`);
    problems.push(...errors);
    if (audit && npmDir) {
      // npm audit exits non-zero when it finds anything; the JSON on stdout is what counts.
      let out;
      try {
        out = execSync("npm audit --json", { cwd: npmDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch (error) {
        out = error.stdout;
      }
      problems.push(...auditErrors({ dir: npmDir, audit: JSON.parse(out), accepted }));
    }
  }
  for (const problem of problems) console.error(`  ${problem}`);
  if (problems.length > 0) process.exit(1);
}

if (process.argv[1]?.endsWith("check-deps.mjs")) await main();
