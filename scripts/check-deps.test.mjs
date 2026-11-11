import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ageErrors,
  auditErrors,
  expiredExceptions,
  cratesItems,
  cratesPinErrors,
  rustItems,
  npmItems,
  npmPinErrors,
  parseAccepted,
  parseExceptions,
} from "./check-deps.mjs";

const now = "2026-10-31T00:00:00Z";
const OLD = "2026-01-01T00:00:00Z";
const YOUNG = "2026-10-25T00:00:00Z";
const header =
  "| Ecosystem | Package | Version | Published | Advisory | Recorded | Expires |\n|---|---|---|---|---|---|---|\n";
const npmItem = { ecosystem: "npm", name: "a", version: "1.0.0" };
const times = (published, ecosystem = "npm", name = "a", version = "1.0.0") => ({
  [ecosystem]: { [name]: { [version]: published } },
});

test("passes an old package", () => {
  const { errors } = ageErrors({ items: [npmItem], times: times(OLD), exceptions: [], now });
  assert.deepEqual(errors, []);
});

test("fails a package under 14 days old", () => {
  const { errors } = ageErrors({ items: [npmItem], times: times(YOUNG), exceptions: [], now });
  assert.match(errors[0], /under 14 days old/);
});

test("reads transitive npm packages, so a too-new one fails too", () => {
  const lock = { packages: { "": {}, "node_modules/b/node_modules/c": { version: "2.0.0" } } };
  const items = npmItems(lock);
  assert.deepEqual(items, [{ ecosystem: "npm", name: "c", version: "2.0.0" }]);
  const { errors } = ageErrors({ items, times: times(YOUNG, "npm", "c", "2.0.0"), exceptions: [], now });
  assert.match(errors[0], /c@2.0.0/);
});

test("fails a range instead of an exact pin", () => {
  for (const spec of ["^1.0.0", "~1.0.0", "latest", "1.x"]) {
    assert.match(npmPinErrors({ dependencies: { a: spec } })[0], /not an exact pin/);
  }
  assert.deepEqual(npmPinErrors({ dependencies: { a: "1.0.0" } }), []);
});

test("a matching exception allows a young package", () => {
  const exceptions = [{ ecosystem: "npm", name: "a", version: "1.0.0", expires: "2026-11-08" }];
  const result = ageErrors({ items: [npmItem], times: times(YOUNG), exceptions, now });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.used, ["npm a@1.0.0"]);
});

test("an exception for another version or ecosystem doesn't count", () => {
  for (const other of [
    { ecosystem: "npm", name: "a", version: "9.9.9" },
    { ecosystem: "crates", name: "a", version: "1.0.0" },
  ]) {
    const { errors } = ageErrors({ items: [npmItem], times: times(YOUNG), exceptions: [other], now });
    assert.equal(errors.length, 1);
  }
});

test("fails when a publish date can't be found", () => {
  const { errors } = ageErrors({ items: [npmItem], times: {}, exceptions: [], now });
  assert.match(errors[0], /no publish date/);
});

test("every ecosystem's lapsed exception fails, even if the package is now old enough", () => {
  for (const ecosystem of ["npm", "crates", "rust-toolchain"]) {
    const rows = [{ ecosystem, name: "a", version: "1.0.0", expires: "2026-10-30" }];
    assert.match(expiredExceptions(rows, now)[0], /expired on 2026-10-30/);
  }
});

test("an exception holds through its expiry day, then lapses", () => {
  const rows = [{ ecosystem: "crates", name: "a", version: "1", expires: "2026-11-02" }];
  assert.deepEqual(expiredExceptions(rows, "2026-11-02T23:00:00Z"), []);
  assert.equal(expiredExceptions(rows, "2026-11-03T00:00:00Z").length, 1);
});

test("an exact timestamp with a zone is honoured to the minute", () => {
  const rows = [{ ecosystem: "rust-toolchain", name: "rust", version: "1", expires: "2026-11-03T23:59+05:30" }];
  assert.deepEqual(expiredExceptions(rows, "2026-11-03T18:28:00Z"), []);
  assert.equal(expiredExceptions(rows, "2026-11-03T18:30:00Z").length, 1);
  const { errors } = parseExceptions(
    `${header}| rust-toolchain | rust | 1.99.1 | 2026-10-15 | RUSTSEC-1 | 2026-10-31 | 2026-11-03T23:59+05:30 |\n`,
  );
  assert.deepEqual(errors, []);
});

test("reads the table", () => {
  const { rows, errors } = parseExceptions(
    `${header}| crates | cc | 1.11.1 | 2026-11-06 | RUSTSEC-2026-0001 | 2026-11-08 | 2026-11-20 |\n`,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(rows, [
    { ecosystem: "crates", name: "cc", version: "1.11.1", advisory: "RUSTSEC-2026-0001", expires: "2026-11-20" },
  ]);
});

test("a row it can't read is an error, never silently skipped", () => {
  for (const row of [
    "| pypi | a | 1 | 2026-10-19 | GHSA-x | 2026-10-31 | 2026-11-02 |",
    "| npm | a | 1 | 2026-10-19 | GHSA-x | 2026-10-31 | soon |",
    "| npm | a | 1 | 2026-10-19 | | 2026-10-31 | 2026-11-02 |",
    "| npm | a | 1 |",
  ]) {
    const { rows, errors } = parseExceptions(`${header}${row}\n`);
    assert.equal(rows.length, 0, row);
    assert.equal(errors.length, 1, row);
  }
});

const acceptedDoc = `${header}

## Accepted advisories

| Where | Package | Advisory | Recorded | Expires |
|---|---|---|---|---|
| infra | minimatch | GHSA-g3hv-75wg-m249 | 2026-11-09 | 2026-12-15 |
`;
const finding = (name, ghsa) => ({
  vulnerabilities: {
    "aws-cdk-lib": { via: [name] },
    [name]: { via: [{ name, url: `https://github.com/advisories/${ghsa}`, severity: "moderate" }] },
  },
});

test("accepted advisories are read from their own table, not as young-release exceptions", () => {
  const { rows, errors } = parseAccepted(acceptedDoc);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].where, "infra");
  assert.deepEqual(parseExceptions(acceptedDoc).rows, []);
});

test("an accepted advisory passes only in the directory it was accepted for", () => {
  const { rows } = parseAccepted(acceptedDoc);
  assert.deepEqual(auditErrors({ dir: "infra", audit: finding("minimatch", "GHSA-g3hv-75wg-m249"), accepted: rows }), []);
  assert.match(auditErrors({ dir: "api", audit: finding("minimatch", "GHSA-g3hv-75wg-m249"), accepted: rows })[0], /not an accepted advisory/);
});

test("a new advisory fails, and an accepted one that no longer appears must be removed", () => {
  const { rows } = parseAccepted(acceptedDoc);
  const errors = auditErrors({ dir: "infra", audit: finding("tar", "GHSA-xxxx-yyyy-zzzz"), accepted: rows });
  assert.ok(errors.some((e) => /tar GHSA-xxxx-yyyy-zzzz .* not an accepted advisory/.test(e)));
  assert.ok(errors.some((e) => /minimatch GHSA-g3hv-75wg-m249 no longer appears/.test(e)));
});

test("an accepted advisory expires like any exception, and a bad row fails", () => {
  const { rows } = parseAccepted(acceptedDoc);
  assert.match(expiredExceptions(rows, "2026-12-16T00:00:00Z")[0], /expired on 2026-12-15/);
  assert.deepEqual(expiredExceptions(rows, "2026-12-15T12:00:00Z"), []);
  assert.match(parseAccepted(acceptedDoc.replace("GHSA-g3hv-75wg-m249", "CVE-1")).errors[0], /can't read/);
});

test("reads every registry crate in Cargo.lock, transitive ones too, and skips our path crates", () => {
  const lock = [
    "version = 4",
    "",
    "[[package]]",
    'name = "cc"',
    'version = "1.10.0"',
    'source = "registry+https://github.com/rust-lang/crates.io-index"',
    "",
    "[[package]]",
    'name = "gridrace-core"',
    'version = "0.1.0"',
    "",
    "[[package]]",
    'name = "shlex"',
    'version = "2.0.1"',
    'source = "registry+https://github.com/rust-lang/crates.io-index"',
  ].join("\n");
  assert.deepEqual(cratesItems(lock), [
    { ecosystem: "crates", name: "cc", version: "1.10.0" },
    { ecosystem: "crates", name: "shlex", version: "2.0.1" },
  ]);
  const young = times(YOUNG, "crates", "shlex", "2.0.1");
  const items = cratesItems(lock).slice(1);
  assert.match(ageErrors({ items, times: young, exceptions: [], now }).errors[0], /crates shlex@2.0.1/);
});

test("crates must be pinned with =x.y.z; path crates are exempt", () => {
  const manifest = (spec) => `[package]\nname = "x"\n\n[dependencies]\n${spec}\n\n[workspace]\n`;
  for (const spec of ['a = "1.0.0"', 'a = "^1.0.0"', 'a = { version = "1.0", features = ["x"] }', 'a = "*"']) {
    assert.match(cratesPinErrors(manifest(spec))[0], /not an exact pin/, spec);
  }
  for (const spec of ['a = "=1.0.0"', 'a = { version = "=1.0.0", default-features = false }', 'a = { path = "../a" }']) {
    assert.deepEqual(cratesPinErrors(manifest(spec)), [], spec);
  }
  assert.match(cratesPinErrors('[dev-dependencies]\nb = "0.4"\n')[0], /b: 0.4/);
  assert.match(cratesPinErrors("[target.'cfg(unix)'.dependencies]\nc = \"1\"\n")[0], /c: 1/);
  assert.deepEqual(cratesPinErrors('[package]\nversion = "0.1.0"\nedition = "2024"\n'), []);
});

test("reads the stable toolchain and every dated nightly a workflow uses", () => {
  const workflow = "run: rustup toolchain install nightly-2026-10-28\n  cargo +nightly-2026-10-28 fuzz";
  const items = rustItems('[toolchain]\nchannel = "1.99.1"\n', workflow);
  assert.deepEqual(items, [
    { ecosystem: "rust-toolchain", name: "rust", version: "1.99.1" },
    { ecosystem: "rust-toolchain", name: "rust", version: "nightly-2026-10-28" },
  ]);
  const young = times(YOUNG, "rust-toolchain", "rust", "nightly-2026-10-28");
  assert.match(ageErrors({ items: items.slice(1), times: young, exceptions: [], now }).errors[0], /under 14 days/);
});

/** Runs the real command on the repo's toolchain files plus a temporary Cargo directory. */
function runCli(exceptionRow, crateDate) {
  const dir = mkdtempSync(join(tmpdir(), "check-deps-"));
  writeFileSync(join(dir, "Cargo.toml"), '[package]\nname = "x"\n\n[dependencies]\ncc = "=1.11.1"\n');
  writeFileSync(
    join(dir, "Cargo.lock"),
    '[[package]]\nname = "cc"\nversion = "1.11.1"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n',
  );
  writeFileSync(join(dir, "ex.md"), `${header}${exceptionRow}\n`);
  const workflows = readdirSync(".github/workflows").map((f) => readFileSync(join(".github/workflows", f), "utf8"));
  const rust = Object.fromEntries(
    rustItems(readFileSync("rust-toolchain.toml", "utf8"), workflows.join("\n")).map((i) => [i.version, OLD]),
  );
  writeFileSync(join(dir, "times.json"), JSON.stringify({ crates: { cc: { "1.11.1": crateDate } }, "rust-toolchain": { rust } }));
  return spawnSync(
    process.execPath,
    ["scripts/check-deps.mjs", "--now", "2026-11-12T00:00:00Z", "--times", join(dir, "times.json"), "--exceptions", join(dir, "ex.md"), dir],
    { encoding: "utf8" },
  );
}

test("the real command exits 1 on a young crate and on a lapsed exception, 0 when clean", () => {
  const young = runCli("", "2026-11-06T00:00:00Z");
  assert.equal(young.status, 1);
  assert.match(young.stderr, /crates cc@1.11.1: published 2026-11-06, under 14 days old/);

  const covered = "| crates | cc | 1.11.1 | 2026-11-06 | RUSTSEC-2026-0001 | 2026-11-08 | 2026-11-20 |";
  assert.equal(runCli(covered, "2026-11-06T00:00:00Z").status, 0);

  const lapsed = "| crates | cc | 1.11.1 | 2026-11-06 | RUSTSEC-2026-0001 | 2026-11-08 | 2026-11-10 |";
  const result = runCli(lapsed, OLD);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exception expired on 2026-11-10/);

  assert.equal(runCli("", OLD).status, 0);
});
