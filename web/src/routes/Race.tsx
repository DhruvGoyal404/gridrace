import { useEffect, useMemo, useState } from "react";
import { Board, type Marks } from "../components/Board";
import { Icon } from "../components/Icon";
import { Lanes, type LaneState } from "../components/Lanes";
import { TierPicker } from "../components/TierPicker";
import { SPEEDS, Transport } from "../components/Transport";
import { Engine, engine } from "../engine/client";
import { ALGORITHMS, type AlgoIndex, TIERS } from "../engine/protocol";
import { useReducedMotion } from "../lib/browser";
import { count, randomSeed } from "../lib/format";
import { cellName, parse } from "../lib/sudoku";

/** Brute force can need millions of nodes; past this it reports "gave up". */
export const NODE_LIMIT = 20_000_000;
/** Events kept for the replay; the trace says when it hit this. */
export const TRACE_CAP = 100_000;

/** Expert, needs an XY-Wing: generate::minimal_puzzle(18). */
export const DEFAULT_PUZZLE = "....36.5..8.5......17.2......5...........7.6.6.....498..2..817......4....51.9...6";

export interface PuzzleMeta {
  puzzle: string;
  difficulty: string | null;
  hardest: string | null;
  seed: number | null;
}

const KIND = ["guess", "forced", "undo"] as const;

interface Props {
  meta: PuzzleMeta;
  setMeta: (m: PuzzleMeta) => void;
  onPlay: (puzzle: string) => void;
}

export function Race({ meta, setMeta, onPlay }: Props) {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);
  // Lane results belong to one run of one puzzle; anything else is still searching.
  const runKey = `${run}:${meta.puzzle}`;
  const [results, setResults] = useState<{ key: string; lanes: LaneState[] }>({ key: "", lanes: [] });
  const lanes: LaneState[] = results.key === runKey ? results.lanes : ALGORITHMS.map(() => ({ status: "searching" }));
  const [selected, setSelected] = useState<AlgoIndex>(2);
  const [tier, setTier] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Race: four workers, one per solver, in parallel.
  useEffect(() => {
    const workers = ALGORITHMS.map(() => new Engine());
    let live = true;
    const settle = (i: number, l: LaneState) =>
      live &&
      setResults((r) => {
        const base = r.key === runKey ? r.lanes : ALGORITHMS.map((): LaneState => ({ status: "searching" }));
        return { key: runKey, lanes: base.map((x, j) => (j === i ? l : x)) };
      });
    ALGORITHMS.forEach((a, i) => {
      workers[i]!
        .race(meta.puzzle, a.index, NODE_LIMIT, TRACE_CAP)
        .then((result) => settle(i, { status: "done", result }))
        .catch((e: Error) => settle(i, { status: "error", message: e.message }));
    });
    return () => {
      live = false;
      workers.forEach((w) => w.terminate());
    };
  }, [meta.puzzle, runKey]);

  const lane = lanes[selected];
  const result = lane?.status === "done" ? lane.result : null;
  const total = result ? result.trace.length / 3 : 0;

  // Replay state belongs to one trace; a new trace starts from the beginning (or the end, for
  // reduced motion, which never autoplays).
  const [replay, setReplay] = useState<{ trace: Uint8Array | null; position: number; playing: boolean }>({
    trace: null,
    position: 0,
    playing: false,
  });
  const trace = result?.trace ?? null;
  const current = replay.trace === trace ? replay : { trace, position: reduced ? total : 0, playing: !reduced && total > 0 };
  const { position, playing } = current;
  const setPosition = (f: number | ((p: number) => number)) =>
    setReplay((r) => {
      const base = r.trace === trace ? r : current;
      return { ...base, trace, position: typeof f === "function" ? f(base.position) : f };
    });
  const setPlaying = (f: boolean | ((p: boolean) => boolean)) =>
    setReplay((r) => {
      const base = r.trace === trace ? r : current;
      return { ...base, trace, playing: typeof f === "function" ? f(base.playing) : f };
    });
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      carry += ((now - last) / 1000) * SPEEDS[speed]!.perSecond;
      last = now;
      const steps = Math.floor(carry);
      carry -= steps;
      if (steps > 0) {
        setReplay((r) => {
          // A trace that just arrived autoplays from its first event.
          const base = r.trace === trace ? r : { trace, position: 0, playing: true };
          const next = Math.min(total, base.position + steps);
          return { ...base, position: next, playing: next < total };
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, total, trace]);

  const givens = useMemo(() => parse(meta.puzzle), [meta.puzzle]);
  // Board at `position`: the givens with the first `position` events applied. Pure, and cheap:
  // even 100,000 events replay in well under a millisecond.
  const cells = useMemo(() => {
    const out = [...givens];
    const trace = result?.trace;
    for (let i = 0; trace && i < position; i++) {
      const cell = trace[i * 3]!;
      out[cell] = trace[i * 3 + 2] === 2 ? 0 : trace[i * 3 + 1]!;
    }
    return out;
  }, [givens, result, position]);

  const lastEvent =
    result && position > 0
      ? { cell: result.trace[(position - 1) * 3]!, digit: result.trace[(position - 1) * 3 + 1]!, kind: KIND[result.trace[(position - 1) * 3 + 2]!]! }
      : null;
  const marks: Marks = { last: lastEvent ? { cell: lastEvent.cell, kind: lastEvent.kind } : null };
  const flapMs = reduced || SPEEDS[speed]!.perSecond > 64 ? 0 : SPEEDS[speed]!.perSecond > 16 ? 60 : 140;

  async function newPuzzle() {
    setBusy(true);
    setError(null);
    try {
      const g = await engine().generate(tier, randomSeed());
      setMeta({ puzzle: g.puzzle, difficulty: g.difficulty, hardest: g.hardest, seed: g.seed });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const finished = lanes.filter((l) => l.status === "done" || l.status === "error").length;

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-12 sm:pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h1 className="semi-condensed text-[28px] leading-tight font-bold text-balance lg:text-[36px]">
            Four Sudoku solvers. One puzzle. Every node counted.
          </h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {meta.difficulty ? `${meta.difficulty}` : "Pasted puzzle"}
            {meta.hardest ? `, needs ${meta.hardest}` : ""}
            {meta.seed !== null ? `, seed ${meta.seed}` : ""}. Running in your browser as WebAssembly, one worker per solver.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <section aria-label="Replay board" className="grid content-start gap-4">
          <Board cells={cells} givens={givens} marks={marks} flapMs={flapMs} label="Sudoku board, replaying the selected solver" />
          <Transport
            position={position}
            total={total}
            playing={playing}
            speed={speed}
            disabled={!result}
            onPlay={() => {
              if (position >= total) setPosition(0);
              setPlaying((p) => !p);
            }}
            onStep={(d) => {
              setPlaying(false);
              setPosition((p) => Math.max(0, Math.min(total, p + d)));
            }}
            onSeek={(p) => {
              setPlaying(false);
              setPosition(p);
            }}
            onSpeed={setSpeed}
          />
          <p className="max-w-[calc(var(--cell)*9+24px)] text-[15px] text-ink-2" aria-live="off">
            {result ? (
              <>
                <span className="font-semibold text-ink">{ALGORITHMS[selected].code}</span> event {count(position)} of {count(total)}
                {lastEvent
                  ? `: ${lastEvent.kind === "undo" ? "undo" : lastEvent.kind} ${lastEvent.kind === "undo" ? "" : `${lastEvent.digit} at `}${cellName(lastEvent.cell)}`
                  : ""}
                .{" "}
                {result.trace_capped && (
                  <span className="text-ink">
                    Replay covers the first {count(TRACE_CAP)} events; the search went on past them.
                  </span>
                )}
              </>
            ) : (
              "Waiting for the selected solver to arrive."
            )}
          </p>
        </section>

        <section aria-labelledby="board-title" className="grid content-start gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <TierPicker tier={tier} onTier={setTier} legend="New puzzle at" />
            <button
              type="button"
              onClick={newPuzzle}
              disabled={busy}
              className="flex h-9 items-center gap-2 border border-ink px-3 text-[14px] font-semibold disabled:opacity-40"
            >
              <Icon name="shuffle" className="size-4" />
              {busy ? `Generating ${TIERS[tier]}...` : "New puzzle"}
            </button>
            <button
              type="button"
              onClick={() => setRun((r) => r + 1)}
              className="flex h-9 items-center bg-signal px-4 text-[14px] font-semibold text-on-signal"
            >
              Race again
            </button>
            <button
              type="button"
              onClick={() => onPlay(meta.puzzle)}
              className="flex h-9 items-center px-2 text-[14px] font-semibold underline underline-offset-4"
            >
              Play this puzzle
            </button>
          </div>
          {error && (
            <p role="alert" className="text-[15px] text-danger">
              {error}
            </p>
          )}
          <div>
            <h2 id="board-title" className="label mb-2 flex justify-between text-ink-2">
              <span>Departures</span>
              <span aria-live="polite">{finished === 4 ? "All arrived" : `${finished} of 4 arrived`}</span>
            </h2>
            <Lanes lanes={lanes} selected={selected} onSelect={setSelected} nodeLimit={NODE_LIMIT} />
          </div>
        </section>
      </div>
    </div>
  );
}
