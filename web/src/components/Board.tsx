import { useEffect, useRef, type KeyboardEvent } from "react";
import { type Cells, PEERS, box, cellLabel, col, hasNote, row } from "../lib/sudoku";

export interface Marks {
  /** Cells of a hint's pattern: signal outline. */
  pattern?: ReadonlySet<number>;
  /** The house or area the hint points at: signal wash. */
  area?: ReadonlySet<number>;
  /** The cell a hint places into: signal plate. */
  target?: number | null;
  /** Entries that are wrong or clash: danger digit. */
  wrong?: ReadonlySet<number>;
  /** Notes a hint removes, per cell: struck in danger. */
  struck?: ReadonlyMap<number, readonly number[]>;
  /** The cell the replay just changed, and how. */
  last?: { cell: number; kind: "guess" | "forced" | "undo" } | null;
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

export function Board({ cells, givens, notes, selected = null, onSelect, onKey, marks = {}, flapMs = 140, label }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const interactive = Boolean(onSelect);
  const focusCell = selected ?? 0;

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

  const peers = selected === null ? null : new Set(PEERS[selected]);
  const selectedDigit = selected === null ? 0 : cells[selected];

  return (
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
            const d = cells[c] ?? 0;
            const given = (givens[c] ?? 0) !== 0;
            const isSelected = c === selected;
            const wrong = marks.wrong?.has(c);
            const target = marks.target === c;
            const sameDigit = !isSelected && d !== 0 && d === selectedDigit;
            const last = marks.last?.cell === c ? marks.last.kind : null;
            const struck = marks.struck?.get(c);
            const right = cc === 8 ? 0 : box(c) !== box(c + 1) ? 2 : 1;
            const bottom = r === 8 ? 0 : box(c) !== box(c + 9) ? 2 : 1;
            const bg = target
              ? "bg-signal"
              : last === "guess"
                ? "bg-[var(--signal-wash)]"
                : marks.area?.has(c)
                  ? "bg-[var(--signal-wash)]"
                  : peers?.has(c) || sameDigit
                    ? "[background-image:linear-gradient(var(--tint),var(--tint))]"
                    : "";
            return (
              <div
                key={c}
                role="gridcell"
                data-cell={c}
                tabIndex={interactive ? (c === focusCell ? 0 : -1) : undefined}
                aria-selected={interactive ? isSelected : undefined}
                aria-label={cellLabel(c, d, notes?.[c] ?? 0, given)}
                onMouseDown={interactive ? () => onSelect?.(c) : undefined}
                onFocus={interactive && !isSelected ? () => onSelect?.(c) : undefined}
                className={[
                  "tile grid size-[var(--cell)] place-items-center outline-none",
                  bg,
                  isSelected ? "z-10 shadow-[inset_0_0_0_2px_var(--focus)]" : "",
                  marks.pattern?.has(c) ? "shadow-[inset_0_0_0_2px_var(--signal)]" : "",
                  interactive ? "cursor-pointer" : "",
                ].join(" ")}
                style={{ marginRight: right, marginBottom: bottom }}
              >
                {d !== 0 ? (
                  <span
                    key={d}
                    className={[
                      flapMs > 0 && !given ? "flap-in" : "",
                      "condensed text-[calc(var(--cell)*0.62)] leading-none font-semibold",
                      target ? "text-on-signal" : wrong ? "text-danger underline decoration-2 underline-offset-4" : given ? "text-ink" : "text-placed",
                    ].join(" ")}
                  >
                    {d}
                  </span>
                ) : notes && notes[c] ? (
                  <span className="grid size-full grid-cols-3 grid-rows-3 p-[8%]" aria-hidden="true">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <span
                        key={n}
                        className={[
                          "note grid place-items-center text-[calc(var(--cell)*0.22)] leading-none font-medium",
                          struck?.includes(n) ? "text-danger line-through decoration-2" : "text-ink-2",
                        ].join(" ")}
                        style={{ fontStretch: "85%" }}
                        // Drawn by CSS: the cell's accessible name already lists its notes.
                        data-note={hasNote(notes[c] ?? 0, n) || struck?.includes(n) ? n : undefined}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
