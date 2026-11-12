import { type KeyboardEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Board, type Marks } from "../components/Board";
import { Icon } from "../components/Icon";
import { TierPicker } from "../components/TierPicker";
import { engine } from "../engine/client";
import { type HintResult, TIERS } from "../engine/protocol";
import { HintPanel, RUNGS, unitCells } from "../play/HintPanel";
import { type Game, type PlayState, mistakes, reduce, start } from "../play/game";
import { store, useReducedMotion } from "../lib/browser";
import { clock, randomSeed } from "../lib/format";
import { clashes, format, parse } from "../lib/sudoku";

const SAVE = "gridrace.play";

type Saved = Pick<PlayState, "game" | "cells" | "notes" | "elapsed" | "solved">;

/** A puzzle to load, from "Play this puzzle" on the race page (?p=...). */
function requested(): string | null {
  const p = new URLSearchParams(location.search).get("p");
  return p && /^[0-9.]{81}$/.test(p) ? p : null;
}

export function Play() {
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(
    (s: PlayState | null, a: Parameters<typeof reduce>[1] | { type: "load"; state: PlayState }) =>
      a.type === "load" ? a.state : s && reduce(s, a),
    null,
    (): PlayState | null => {
      if (requested()) return null;
      const saved = store.get<Saved>(SAVE);
      return saved?.game?.givens?.length === 81 ? { ...start(saved.game), ...saved } : null;
    },
  );
  const [tier, setTier] = useState(() => store.get<number>("gridrace.tier") ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<{ result: HintResult; level: number; board: string } | null>(null);

  const newGame = useCallback(async (t: number) => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const g = await engine().generate(t, randomSeed());
      const game: Game = { givens: parse(g.puzzle), solution: parse(g.solution), difficulty: g.difficulty, hardest: g.hardest, seed: g.seed };
      dispatch({ type: "load", state: start(game) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // First load: a requested puzzle, else the saved game (the reducer's initial state), else a new one.
  const initial = useRef(state);
  useEffect(() => {
    const p = requested();
    const load = p
      ? engine()
          .analyze(p)
          .then((a): Game => {
            if (a.solutions !== 1 || !a.solution) throw new Error("That puzzle doesn't have exactly one solution.");
            history.replaceState(null, "", "/play");
            return { givens: parse(a.puzzle), solution: parse(a.solution), difficulty: a.difficulty, hardest: a.hardest, seed: null };
          })
      : initial.current
        ? null
        : engine()
            .generate(store.get<number>("gridrace.tier") ?? 1, randomSeed())
            .then((g): Game => ({ givens: parse(g.puzzle), solution: parse(g.solution), difficulty: g.difficulty, hardest: g.hardest, seed: g.seed }));
    load?.then((game) => dispatch({ type: "load", state: start(game) })).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (state) store.set(SAVE, { game: state.game, cells: state.cells, notes: state.notes, elapsed: state.elapsed, solved: state.solved } satisfies Saved);
  }, [state]);

  // The clock runs while the tab is visible and the puzzle unsolved.
  const running = Boolean(state && !state.solved);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") dispatch({ type: "tick", seconds: 1 });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const boardText = state ? format(state.cells) : "";
  // A hint describes the board it was asked on; any change makes it stale.
  const liveHint = hint && hint.board === boardText ? hint : null;

  async function askHint() {
    if (!state) return;
    if (liveHint) {
      if (liveHint.level < RUNGS.length - 1) setHint({ ...liveHint, level: liveHint.level + 1 });
      else applyHint(liveHint.result);
      return;
    }
    try {
      const result = await engine().hint(format(state.game.givens), boardText);
      setHint({ result, level: 1, board: boardText });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function applyHint(r: HintResult) {
    if (r.kind === "steps") {
      const last = r.steps.at(-1)!;
      dispatch({ type: "apply", place: last.place, eliminate: r.steps.flatMap((s) => s.eliminate) });
    } else if (r.kind === "reveal") {
      dispatch({ type: "apply", place: [r.cell, r.digit], eliminate: [] });
    } else if (r.kind === "mistakes") {
      dispatch({ type: "erase", cells: r.cells });
    }
    setHint(null);
  }

  const marks = useMemo<Marks>(() => {
    if (!state) return {};
    const wrong = new Set<number>(clashes(state.cells));
    if (state.showMistakes) for (const c of mistakes(state)) wrong.add(c);
    const m: Marks = { wrong };
    const h = liveHint;
    if (!h) return m;
    const r = h.result;
    if (r.kind === "mistakes" && h.level >= 2) r.cells.forEach((c) => wrong.add(c));
    if (r.kind === "conflict") r.pairs.flat().forEach((c) => wrong.add(c));
    if (r.kind === "reveal" && h.level >= 2) m.area = new Set([r.cell]);
    if (r.kind === "reveal" && h.level >= 3) m.target = r.cell;
    if (r.kind === "steps") {
      const first = r.steps[0]!;
      const last = r.steps.at(-1)!;
      if (h.level === 2) m.area = new Set(first.unit ? unitCells(first.unit) : first.cells);
      if (h.level >= 3) {
        m.pattern = new Set(r.steps.flatMap((s) => s.cells));
        const struck = new Map<number, number[]>();
        for (const [c, d] of r.steps.flatMap((s) => s.eliminate)) struck.set(c, [...(struck.get(c) ?? []), d]);
        m.struck = struck;
        m.target = last.place?.[0] ?? null;
      }
    }
    return m;
  }, [state, liveHint]);

  // Notes shown on the board: the player's, plus eliminated ones so the strike is visible.
  const shownNotes = useMemo(() => {
    if (!state) return [];
    if (!marks.struck) return state.notes;
    return state.notes.map((n, c) => n | (marks.struck?.get(c) ?? []).reduce((m, d) => m | (1 << (d - 1)), 0));
  }, [state, marks.struck]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return; // undo and redo are page-wide, below
    if (/^[1-9]$/.test(k)) dispatch({ type: "digit", digit: Number(k) });
    else if (k === "backspace" || k === "delete" || k === "0") dispatch({ type: "clear" });
    else if (k === "n" || k === "p") dispatch({ type: "toggleNotes" });
    else if (k === "h") void askHint();
    else return;
    e.preventDefault();
  }

  // Undo and redo work wherever focus is on the page, except while typing in a field.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest("input, textarea, dialog")) return;
      const k = e.key.toLowerCase();
      if (k === "z") dispatch({ type: e.shiftKey ? "redo" : "undo" });
      else if (k === "y") dispatch({ type: "redo" });
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, []);

  if (!state) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10 text-ink-2" role="status">
        {error ?? "Generating a puzzle..."}
      </div>
    );
  }

  const placed = (d: number) => state.cells.filter((x) => x === d).length;
  const tool = "flex h-10 items-center gap-2 border border-rule bg-panel px-3 text-[14px] font-semibold text-ink hover:border-ink disabled:opacity-40";

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-12 sm:pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="semi-condensed text-[28px] leading-tight font-bold lg:text-[36px]">Play</h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {state.game.difficulty ?? "Pasted puzzle"}
            {state.game.seed !== null ? `, seed ${state.game.seed}` : ""}. Hints explain why, one step at a time.
          </p>
        </div>
        <p className="condensed text-[28px] font-semibold">
          <span className="sr-only">Time </span>
          {clock(state.elapsed)}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <section aria-label="Board" className="grid content-start gap-4">
          <Board
            cells={state.cells}
            givens={state.game.givens}
            notes={shownNotes}
            selected={state.selected}
            onSelect={(cell) => dispatch({ type: "select", cell })}
            onKey={onKey}
            marks={marks}
            flapMs={reduced ? 0 : 140}
            label="Sudoku board. Arrow keys move, 1 to 9 enter, N toggles notes, H asks for a hint."
          />
          <div className="grid max-w-[calc(var(--cell)*9+24px)] grid-cols-9 gap-1" role="group" aria-label="Digits">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => dispatch({ type: "digit", digit: d })}
                disabled={placed(d) >= 9}
                aria-label={`${state.notesMode ? "Note" : "Enter"} ${d}`}
                className="condensed grid h-12 place-items-center border border-rule bg-panel text-[24px] font-semibold text-ink hover:border-ink disabled:opacity-30"
              >
                {d}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Tools" className="grid content-start gap-6">
          {state.solved && (
            <div role="status" className="border border-ink bg-signal p-4 text-on-signal">
              <p className="semi-condensed text-[22px] font-bold">Solved in {clock(state.elapsed)}.</p>
              <p className="text-[15px]">{state.game.difficulty}{state.game.hardest ? `, needed ${state.game.hardest}` : ""}.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={tool} aria-pressed={state.notesMode} onClick={() => dispatch({ type: "toggleNotes" })}>
              <Icon name="pencil" />
              Notes {state.notesMode ? "on" : "off"}
            </button>
            <button type="button" className={tool} onClick={() => dispatch({ type: "undo" })} disabled={!state.past.length || state.solved}>
              <Icon name="undo" />
              Undo
            </button>
            <button type="button" className={tool} onClick={() => dispatch({ type: "redo" })} disabled={!state.future.length}>
              <Icon name="redo" />
              Redo
            </button>
            <button type="button" className={tool} onClick={() => dispatch({ type: "clear" })} disabled={state.solved}>
              <Icon name="close" />
              Erase
            </button>
            <button type="button" className={tool} onClick={() => dispatch({ type: "fillNotes" })} disabled={state.solved}>
              Fill notes
            </button>
            <button type="button" className={tool} aria-pressed={state.showMistakes} onClick={() => dispatch({ type: "toggleMistakes" })}>
              <Icon name="check" />
              Show mistakes {state.showMistakes ? "on" : "off"}
            </button>
          </div>

          <div className="border-t border-rule pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 className="semi-condensed text-[22px] font-bold">Hint</h2>
              <ol className="flex flex-wrap gap-1" aria-label="Hint ladder">
                {RUNGS.map((r, i) => (
                  <li
                    key={r}
                    aria-current={liveHint?.level === i + 1 ? "step" : undefined}
                    className={`label px-2 py-1 whitespace-nowrap ${liveHint && liveHint.level >= i + 1 ? "bg-ink text-panel" : "text-ink-2"}`}
                  >
                    {r}
                  </li>
                ))}
              </ol>
            </div>
            <div aria-live="polite" className="min-h-12">
              {liveHint ? (
                <HintPanel hint={liveHint.result} level={liveHint.level} />
              ) : (
                <p className="text-[15px] text-ink-2">Each press reveals a little more: the technique, where to look, why, then the move itself.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void askHint()}
              disabled={state.solved || liveHint?.result.kind === "solved"}
              className="mt-4 flex h-10 items-center gap-2 bg-signal px-4 text-[15px] font-semibold text-on-signal disabled:opacity-40"
            >
              <Icon name="bulb" />
              {!liveHint
                ? "Give me a hint"
                : liveHint.level < RUNGS.length - 1
                  ? `Show ${RUNGS[liveHint.level]!.toLowerCase()}`
                  : liveHint.result.kind === "mistakes"
                    ? "Erase the wrong entries"
                    : "Apply this move"}
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-5">
            <TierPicker
              tier={tier}
              onTier={(t) => {
                setTier(t);
                store.set("gridrace.tier", t);
              }}
              legend="New game"
            />
            <button type="button" onClick={() => void newGame(tier)} disabled={loading} className="h-9 border border-ink px-3 text-[14px] font-semibold disabled:opacity-40">
              {loading ? `Generating ${TIERS[tier]}...` : "Start"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-[15px] text-danger">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
