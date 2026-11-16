import { memo, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { type Cells, PEERS, box, cellLabel, col, hasNote, row } from "../lib/sudoku";

export interface Marks {
  /** Cells of a hint's pattern, and the cells that prove it: signal outline. */
  pattern?: ReadonlySet<number>;
  /** The house or area the hint points at: signal wash. */
  area?: ReadonlySet<number>;
  /** The cell a hint places into, and the digit: signal plate with the digit on it. */
  target?: { cell: number; digit: number } | null;
  /** Entries that are wrong or clash: danger digit. */
  wrong?: ReadonlySet<number>;
  /** Notes a hint removes, per cell: struck in danger. */
  struck?: ReadonlyMap<number, readonly number[]>;
  /** The cell the replay just changed, and how. */
  last?: { cell: number; kind: "guess" | "forced" | "undo" } | null;
  /** A hint is showing evidence: the selection's peer tint steps aside so it can't read as proof. */
  hint?: boolean;
}

interface Props {
  cells: Cells;
  givens: Cells;
  notes?: readonly number[];
  selected?: number | null;
  onSelect?: (cell: number) => void;
  /** Keys other than navigation, for the selected cell. */
  onKey?: (e: KeyboardEvent<HTMLDivElement>, cell: number) => void;
  marks?: Marks;
  /** Flip duration; 0 turns the split-flap arrival off (reduced motion, fast replay). */
  flapMs?: number;
  label: string;
}

interface CellProps {
  c: number;
  digit: number;
  given: boolean;
  notes: number;
  struck: string;
  bg: string;
  outline: "" | "focus" | "signal" | "dashed";
  tone: "given" | "placed" | "wrong" | "target";
  flap: boolean;
  focusable: boolean;
  selected: boolean;
  interactive: boolean;
  onSelect: (c: number) => void;
}

const OUTLINE = {
  "": "",
  focus: "z-10 shadow-[inset_0_0_0_2px_var(--focus)]",
  signal: "z-10 shadow-[inset_0_0_0_2px_var(--signal)]",
  // The selection while a hint shows evidence: dashed, so it can't be read as part of the proof.
  dashed: "z-10 outline-2 outline-dashed -outline-offset-4 outline-[var(--focus)]",
};
const TONE = {
  given: "text-ink",
  placed: "text-placed",
  wrong: "text-danger underline decoration-2 underline-offset-4",
  target: "text-on-signal",
};

/** One tile. Memoised on plain props, so a replay step redraws only the cells it changes. */
const Cell = memo(function Cell(p: CellProps) {
  const right = col(p.c) === 8 ? 0 : box(p.c) !== box(p.c + 1) ? 2 : 1;
  const bottom = row(p.c) === 8 ? 0 : box(p.c) !== box(p.c + 9) ? 2 : 1;
  const struck = p.struck ? p.struck.split("").map(Number) : [];
  return (
    <div
      role="gridcell"
      data-cell={p.c}
      tabIndex={p.interactive ? (p.focusable ? 0 : -1) : undefined}
      aria-selected={p.interactive ? p.selected : undefined}
      aria-label={cellLabel(p.c, p.digit, p.notes, p.given)}
      onMouseDown={p.interactive ? () => p.onSelect(p.c) : undefined}
      onFocus={p.interactive && !p.selected ? () => p.onSelect(p.c) : undefined}
      className={["tile grid size-[var(--cell)] place-items-center", p.outline === "dashed" ? "" : "outline-none", p.bg, OUTLINE[p.outline], p.interactive ? "cursor-pointer" : ""].join(" ")}
      style={{ marginRight: right, marginBottom: bottom }}
    >
      {p.digit !== 0 ? (
        <span
          key={p.digit}
          className={[p.flap ? "flap-in" : "", "condensed text-[calc(var(--cell)*0.62)] leading-none font-semibold", TONE[p.tone]].join(" ")}
        >
          {p.digit}
        </span>
      ) : p.notes || struck.length ? (
        <span className="grid size-full grid-cols-3 grid-rows-3 p-[8%]" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <span
              key={n}
              className={[
                "note grid place-items-center text-[calc(var(--cell)*0.22)] leading-none font-medium",
                struck.includes(n) ? "text-danger line-through decoration-2" : "text-ink-2",
              ].join(" ")}
              style={{ fontStretch: "85%" }}
              // Drawn by CSS: the cell's accessible name already lists its notes.
              data-note={hasNote(p.notes, n) || struck.includes(n) ? n : undefined}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
});

/** Row and column numbers, matching the r#c# that hints and the replay speak in. Decorative:
 *  each cell's accessible name already says its row and column. */
function Rail({ axis, active }: { axis: "row" | "col"; active: number | null }) {
  const vertical = axis === "row";
  return (
    <div aria-hidden="true" className={vertical ? "flex flex-col pt-[2px]" : "flex pl-[2px]"}>
      {Array.from({ length: 9 }, (_, i) => {
        const gap = i === 8 ? 0 : i % 3 === 2 ? 2 : 1;
        return (
          <span
            key={i}
            className={[
              "condensed grid place-items-center text-[12px] font-semibold",
              vertical ? "h-[var(--cell)] w-4" : "h-4 w-[var(--cell)]",
              active === i ? "bg-signal text-on-signal" : "text-ink-2",
            ].join(" ")}
            style={vertical ? { marginBottom: gap } : { marginRight: gap }}
          >
            {i + 1}
          </span>
        );
      })}
    </div>
  );
}

export function Board({ cells, givens, notes, selected = null, onSelect, onKey, marks = {}, flapMs = 140, label }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const interactive = Boolean(onSelect);
  const focusCell = selected ?? 0;
  // A stable handler, so a parent's inline callback doesn't defeat the cells' memo.
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  });
  const handleSelect = useCallback((c: number) => select.current?.(c), []);

  // Keep DOM focus on the selected cell while the board has focus.
  useEffect(() => {
    if (!interactive || !grid.current?.contains(document.activeElement)) return;
    grid.current.querySelector<HTMLElement>(`[data-cell="${focusCell}"]`)?.focus();
  }, [focusCell, interactive]);

  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onSelect) return;
    const c = focusCell;
    const move: Record<string, number> = {
      ArrowUp: row(c) > 0 ? c - 9 : c + 72,
      ArrowDown: row(c) < 8 ? c + 9 : c - 72,
      ArrowLeft: col(c) > 0 ? c - 1 : c + 8,
      ArrowRight: col(c) < 8 ? c + 1 : c - 8,
      Home: row(c) * 9,
      End: row(c) * 9 + 8,
    };
    const to = move[e.key];
    if (to !== undefined) {
      e.preventDefault();
      onSelect(to);
      return;
    }
    onKey?.(e, c);
  }

  const peers = selected === null || marks.hint ? null : new Set(PEERS[selected]);
  const selectedDigit = selected === null ? 0 : cells[selected];

  return (
    <div className="grid w-fit grid-cols-[auto_auto] gap-1">
      <span aria-hidden="true" />
      <Rail axis="col" active={selected === null ? null : col(selected)} />
      <Rail axis="row" active={selected === null ? null : row(selected)} />
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        aria-readonly={!interactive}
        onKeyDown={keyDown}
        className="grid w-fit grid-cols-9 border-2 border-[var(--box-rule)] bg-[var(--box-rule)] select-none"
        style={{ ["--flap-ms" as string]: `${flapMs}ms` }}
      >
        {Array.from({ length: 9 }, (_, r) => (
          <div role="row" key={r} className="contents">
            {Array.from({ length: 9 }, (_, cc) => {
              const c = r * 9 + cc;
              const target = marks.target?.cell === c ? marks.target : null;
              const digit = target ? target.digit : (cells[c] ?? 0);
              const given = (givens[c] ?? 0) !== 0;
              const isSelected = c === selected;
              const last = marks.last?.cell === c ? marks.last.kind : null;
              const bg = target
                ? "bg-signal"
                : last === "guess" || marks.area?.has(c)
                  ? "bg-[var(--signal-wash)]"
                  : peers?.has(c) || (!isSelected && digit !== 0 && digit === selectedDigit && !marks.hint)
                    ? "[background-image:linear-gradient(var(--tint),var(--tint))]"
                    : "";
              return (
                <Cell
                  key={c}
                  c={c}
                  digit={digit}
                  given={given}
                  notes={notes?.[c] ?? 0}
                  struck={(marks.struck?.get(c) ?? []).join("")}
                  bg={bg}
                  // One outline per cell: the hint's evidence wins over the selection.
                  outline={marks.pattern?.has(c) && !target ? "signal" : isSelected ? (marks.hint ? "dashed" : "focus") : ""}
                  tone={target ? "target" : marks.wrong?.has(c) ? "wrong" : given ? "given" : "placed"}
                  flap={flapMs > 0 && !given}
                  focusable={c === focusCell}
                  selected={isSelected}
                  interactive={interactive}
                  onSelect={handleSelect}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
