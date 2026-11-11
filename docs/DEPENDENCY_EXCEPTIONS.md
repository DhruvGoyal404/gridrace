# Dependency exceptions

Releases younger than 14 days, allowed only because they fix a published security
advisory (CLAUDE.md, "Dependencies"). `scripts/check-deps.mjs` reads the table below.

An entry past its expiry date fails CI, even if the release is now old enough, so a
stale exception can't linger. A row the script can't read fails too. A daily scheduled
run catches a lapse when nothing was pushed.

| Ecosystem | Package | Version | Published | Advisory | Recorded | Expires |
|---|---|---|---|---|---|---|

`Ecosystem` is `npm`, `crates` or `rust-toolchain`. Adding an ecosystem means adding a
reader to `scripts/check-deps.mjs`.

## Accepted advisories

Advisories with no fixed release to adopt, accepted for a stated reason and a short time.
`node scripts/check-deps.mjs --audit <dir>` runs `npm audit` there and fails on any finding
not listed here for that directory, on any entry past its expiry, and on any entry whose
advisory no longer appears, so the entry goes as soon as the fix is in.

| Where | Package | Advisory | Recorded | Expires |
|---|---|---|---|---|
