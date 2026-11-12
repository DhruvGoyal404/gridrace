# GridRace design system

The race is a departure board. Four solvers are four departures from one puzzle, each
with a code, a live status and its numbers, and every digit arrives in the grid with a
split-flap turn. This file is the visual contract for the web app (`web/`). Product facts
live in [PRODUCT.md](PRODUCT.md); the route strategy lives in
`.impeccable/surfaces/`. Written before the build at the owner's request and refreshed
from the built app at the end of M3; where the two differed, this file now says what
shipped.

## Principles

1. **Board first, prose second.** The working race fills the first viewport; explanation
   follows it.
2. **State is form plus word.** Every status has a word and a shape (solid, blinking,
   struck, dashed). Colour reinforces, never carries alone (WCAG 1.4.1).
3. **Registered comparison.** Anything shown per solver is drawn at the same scale on
   the same baseline, so differences are real differences.
4. **One code per solver, everywhere.** `BRT` brute force, `BIT` bitmask, `MRV` MRV +
   propagation, `DLX` Dancing Links, each with one series hue used identically in lanes,
   charts, replay and legends, and always labelled directly.
5. **Quiet chrome, loud data.** The shell is flat and ruled; the board tiles and numbers
   carry the weight.

## Colour

Two boards. **Night** (dark) is the board at a station after dark: matte black, flap
faces, bone characters, Solari yellow. **Enamel** (light) is the station's enamel
signage: white ground, black characters, yellow only as filled plates with black type
(yellow text on white fails contrast and is never used). The theme follows the system
setting; a toggle overrides it and is remembered per device.

| Token | Night | Enamel | Use |
|---|---|---|---|
| `--ground` | `#0B0C0E` | `#F3F4F2` | page background |
| `--panel` | `#131519` | `#FFFFFF` | top bar, lanes, dialogs |
| `--flap` | `#1C1F24` | `#FFFFFF` | board tiles |
| `--flap-edge` | `#2A2E35` | `#C9CED4` | tile border, flap split line |
| `--rule` | `#2A2E35` | `#D7DADF` | hairlines between rows and sections |
| `--box-rule` | `#727883` | `#101215` | the 3×3 box lines on the board |
| `--ink` | `#ECEDEA` | `#101215` | primary text, givens |
| `--ink-2` | `#A6ABB4` | `#474D56` | secondary text, labels |
| `--signal` | `#F5C400` | `#F5C400` | live and selected: primary plate, current step, focus (Night) |
| `--on-signal` | `#101215` | `#101215` | text on a signal plate |
| `--focus` | `#F5C400` | `#101215` | focus ring |
| `--danger` | `#FF6B5E` | `#B42318` | conflicts, mistakes, aborted |
| `--placed` | `#8FD3FF` | `#0B5CAD` | digits the player or a solver placed (vs givens in `--ink`) |

Series hues (one per solver, direct labels always; checked against `--panel`):

| Code | Night | Enamel |
|---|---|---|
| `BRT` | `#FF7A59` | `#B93A0B` |
| `BIT` | `#B9A2FF` | `#5B3CC4` |
| `MRV` | `#3FD0C0` | `#0B6F64` |
| `DLX` | `#7AB0FF` | `#1D5FD6` |

Every text pair above meets WCAG AA (4.5:1 for body text, 3:1 for large text and UI
parts) in both themes; `scripts/contrast.mjs` checks the table and runs in the gate.

## Type

One family, **Archivo** (variable: width 62 to 125, weight 100 to 900, OFL), self-hosted
from `@fontsource-variable/archivo`. The width axis gives the board its condensed flap
digits and the UI its normal width from one file. Tabular figures (`tnum`) everywhere a
number can change.

| Role | Width | Weight | Size |
|---|---|---|---|
| Board digits | 75 | 600 | the cell's height × 0.62 |
| Pencil marks | 85 | 500 | the cell's height × 0.22 |
| Lane numbers | 75 | 600, `tnum` | 18 px, 22 px from 1024 px |
| Headline | 87.5 | 700 | 28 px, 36 px from 1024 px |
| Section heading | 87.5 | 700 | 22 px |
| Body | 100 | 400 | 16 px / 1.5 |
| Label, code | 100 | 600, tracked +0.06em, caps | 12 px |
| Explanation text | 100 | 400 | 15 px / 1.55 |

Fallback stack: `"Archivo Variable", "Arial Narrow", system-ui, sans-serif`.

## Space and the module

Everything comes from the board. One cell is the module `--cell`: `clamp(34px, 9.6vw, 62px)`
(the board is 9 cells plus box rules, so it fits a 390 px phone with 16 px gutters and
caps at about 560 px). Spacing steps: 4, 8, 12, 16, 24, 32, 48 px. Lane row height
equals one cell. Radii: 2 px on tiles and plates (a flap is nearly square), 6 px on
dialogs, nothing round except the status dot.

## Layout

- **Top bar** (56 px): the wordmark GRIDRACE as eight dark flap tiles, nav Race / Play /
  Bench as standard links with a 3 px signal underline on the current route, Paste,
  theme toggle. Generating lives in each screen's tier picker, not in the nav.
- **Race** (desktop ≥ 1024 px): board and its transport in the left column, the departure
  board (four lanes) and the puzzle picker in the right column, the headline above both.
  Below the fold, the explainer: four registered plates, one per solver, with idea,
  complexity and measured medians, then how the generator and hints work.
- **Play**: board left; candidate entry, hint panel and technique explanation right.
- **Mobile** (< 768 px): one column; board full width, then transport, then lanes as
  two-line rows (code, status, time / nodes, backtracks, checks).

## Components

- **Board**: a 9×9 `role="grid"` of tiles. A tile is a flap: two halves split by a
  1 px `--flap-edge` line. Givens in `--ink`, placed digits in `--placed`. Box rules
  2 px `--box-rule`. Selected cell: 2 px `--signal` inset outline (Night) or `--ink`
  (Enamel) plus a signal plate under the row and column header numbers. Peers of the
  selected cell get a 6% ink tint. Conflicts: `--danger` digit plus a struck underline.
- **Hint highlight**: pattern cells get a 2 px signal outline; the placement cell gets a
  signal plate with `--on-signal` digit; eliminated pencil marks are struck through in
  `--danger`.
- **Lane** (departure row, a radio in a radiogroup: the chosen lane is replayed): the
  code in its series hue, or on a signal plate when chosen; solver name; a node bar on a
  log scale whose full width is the node limit (the budget, drawn on one shared axis so
  lanes compare); status; time; nodes, backtracks and checks. No coloured side borders. Status words and forms: `BOARDING` (dashed rule, waiting), `SEARCHING` (blinking
  dot), `ARRIVED` (solid rule), `GAVE UP` (struck, `--danger`, with the limit it hit).
- **Buttons**: primary is a yellow plate with black text (both themes); secondary is a
  1 px `--ink` outline; ghost is text with an underline on hover. 40 px tall, 44 px touch
  target on touch devices.
- **Tier chips**: a radio group (Easy, Medium, Hard, Expert, Master, Beyond); selected
  is a filled ink plate with `--panel` text.
- **Digit pad** (Play): nine plain buttons under the board, each disabled once all nine
  copies are placed; they enter notes while notes mode is on.
- **Hint ladder** (Play): four rungs, Technique, Where to look, Why, Apply, shown as
  plates that fill in as the player climbs. Rung 2 washes the house in signal, rung 3
  outlines the pattern, strikes eliminated notes and plates the target cell, rung 4
  applies the move as one undoable step. A hint goes stale the moment the board changes.
- **Notes** are drawn with CSS (`::before` from `data-note`), because the cell's
  accessible name already lists them; visible text that differed from the name failed
  WCAG 2.5.3.
- **Transport**: step back, play/pause, step forward, speed (0.5×, 1×, 4×, 16×, max), a
  range scrubber over trace events, and the line "Trace capped at N events" when capped.
- **Dialog** (Paste): native `<dialog>`, a textarea, live validation message (invalid
  character with position, wrong length, conflicting cells, no solution, more than one
  solution), and Load.

## Motion

- **Split-flap arrival**, the signature: a digit enters by the top half folding down
  over 140 ms (ease-out, one small settle), then the bottom half. Guess digits flash
  `--signal` for one flip, forced digits arrive in `--placed`, an undo folds back to
  blank. At replay speeds above 16 steps per second, flips shorten to 60 ms; at max,
  digits swap instantly.
- **Counters roll** by flipping changed digits only.
- `prefers-reduced-motion: reduce`: no flips, no blinking; digits and numbers swap
  instantly and SEARCHING shows a static dot.
- Nothing else moves. No hover lifts, no page transitions.

## Accessibility

- WCAG 2.1 AA, checked with axe in the e2e suite.
- Board keyboard model: arrow keys move (wrapping), 1 to 9 enter, 0 / Backspace / Delete
  clear, `N` or `P` toggles notes, `H` climbs the hint ladder, Home / End jump within a
  row. Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) undo and redo anywhere on the Play page except
  inside a text field. Roving tabindex: the board is one tab stop.
- Each cell's accessible name is "row 4, column 6, 7" or "row 4, column 6, empty,
  candidates 2 5 8". Race status and hint text are announced through a polite live
  region; per-step replay is not announced (too chatty) but the scrubber reports its
  position.
- Focus is always visible: 2 px `--focus` ring with 2 px offset.
- Touch targets at least 44 px on touch devices.

## Implementation notes

- Custom CSS sits in `@layer base` and `@layer components`, so a Tailwind utility on an
  element always wins. Unlayered rules once overrode utilities and hid the wordmark.
- No `style` attributes in HTML (the CSP is `style-src 'self'`); React's `style` prop is
  set through the CSSOM and is allowed.
- The split-flap line sits behind the glyphs (`z-index`), so it shows only between
  strokes and never reads as a strikethrough.

## Don'ts

- No neon glow, gradients, glass, or drop shadows: boards are flat.
- No hue-only state, no legend-only series (label directly).
- No cream paper, no serif display: this is signage, not a book.
- No yellow text on the Enamel board.
- No numbers on screen that the browser didn't measure, except the native benchmark
  medians, labelled as measured natively with a link to docs/BENCHMARKS.md.
