---
version: 1
slug: "web-src-routes-race-tsx"
primary_target: "web/src/routes/Race.tsx"
related_targets: ["web/index.html"]
---

# Race (home route `/`)

Mode: Operate (the race and play screens), with a crawlable explainer section below the
working race for first-time visitors and search engines.

Audience and job: an interviewer or developer, arriving from a link, sees four solvers
race on one puzzle within seconds, reads the counters, replays any solver's search, and
scrolls to learn why the later algorithms win. Players switch to Play or Generate from
the top bar. Proof is the live run itself plus the measured native numbers in
docs/BENCHMARKS.md, quoted as measured.

Constraints: PRODUCT.md (no invented claims, WCAG 2.1 AA, keyboard, reduced motion,
light and dark). Traces are capped and say so; brute force can hit its node limit and
says so.

Unattended decision: the owner skipped the question round, so the assigned direction
was built without a decision page. Inferred product facts are labelled in PRODUCT.md.

## Direction contract

THESIS: The race is a departure board: four solvers are four departures from the same
puzzle, each with a code, a live status and its numbers, and every digit arrives in the
grid with a split-flap turn. Refuses the category default of a puzzle app with a
"solve" button and a log, and the dev-tool default of a dark terminal with one neon
accent.

OWN-WORLD: Night board: matte board black with flap-face charcoal, bone-white
characters, Solari signal yellow for the live and the chosen; Enamel day board: white
enamel, black characters, yellow only as filled plates with black type. One condensed
grotesque with tabular figures at board sizes, its normal width for UI. Hairline flap
splits on tiles. Raised by the emission-line rail: status is form plus word (solid,
blinking, struck), never hue alone. Raised by the Saville catalog: each solver carries a
fixed code (BRT, BIT, MRV, DLX) and one series hue used identically everywhere. Raised by
the botanical folio: every per-solver view is drawn at the same scale on the same
baseline so comparisons are registered. Raised by the Crouwel specimen: spacing and
sizes come from the 9-cell module. Raised by the high-density site: lanes pack all
counters on one row with no whitespace inflation. Raised by the cassette j-card: the
node limit and trace cap show as a visible budget per lane.

STORY: The visitor watches four departures leave, sees MRV and DLX arrive in
microseconds while brute force is still searching, opens a lane to replay its search
on the board, and scrolls to the four registered explainer plates with measured medians.
They believe it because the numbers come from the code in their own browser.

FIRST VIEWPORT: Desktop 1440: top bar (wordmark, Race / Play / Generate / Bench,
theme, Paste). Left two-thirds of the content width: the 9x9 board of flap tiles, about
560px, replay transport under it (step back, play/pause, step, speed, scrubber with
"capped at N events" when capped). Right third: the departure board, four lane rows
(code, solver, status, time, nodes, backtracks, checks, budget bar), with the primary
"Race again" yellow plate and the puzzle picker (tier chips, New, Paste) above it. One
sentence headline above both: "Four Sudoku solvers. One puzzle. Every node counted."
Mobile 390: board full width, transport, then lanes as compact two-line rows.

FORM: Solari split-flap departure board, position 6 of 7 on the ordered list.
seed:59fcf12e1f21ae2f. Signature interaction: split-flap digit arrival on the board
during replay (guess flips in yellow, forced in bone, undo flips back to blank) and
rolling flap counters in the lanes; instant under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
