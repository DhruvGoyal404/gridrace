import { useEffect, useRef, useState } from "react";
import { NATIVE, percentile } from "../bench/native";
import { Engine } from "../engine/client";
import { ALGORITHMS, TIERS } from "../engine/protocol";
import { count, duration } from "../lib/format";
import { NODE_LIMIT } from "./Race";

interface Set {
  name: string;
  puzzles: string[];
}

interface Row {
  set: string;
  algo: number;
  median: number;
  p95: number;
  n: number;
}

/** The corpus files beside the app, split into the tiers their comments name. */
async function loadSets(): Promise<Set[]> {
  const read = async (file: string) =>
    (await (await fetch(`/data/${file}`)).text())
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => ({ puzzle: l.slice(0, 81), note: l.slice(81) }));
  const graded = await read("graded.txt");
  const sets: Set[] = TIERS.map((t) => ({
    name: t,
    puzzles: graded.filter((g) => g.note.includes(`, ${t},`)).map((g) => g.puzzle),
  }));
  sets.push({ name: "hardest.txt", puzzles: (await read("hardest.txt")).map((g) => g.puzzle) });
  sets.push({ name: "adversarial.txt", puzzles: (await read("adversarial.txt")).map((g) => g.puzzle) });
  return sets;
}

export function Bench() {
  const [sets, setSets] = useState<Set[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Engine | null>(null);

  useEffect(() => {
    loadSets().then(setSets, (e: Error) => setError(e.message));
    return () => worker.current?.terminate();
  }, []);

  async function run() {
    if (!sets) return;
    worker.current?.terminate();
    const w = new Engine();
    worker.current = w;
    setRows([]);
    setError(null);
    const total = sets.reduce((n, s) => n + s.puzzles.length * 4, 0);
    let done = 0;
    setProgress({ done, total });
    try {
      for (const s of sets) {
        for (const a of ALGORITHMS) {
          const times: number[] = [];
          for (const p of s.puzzles) {
            times.push((await w.time(p, a.index, NODE_LIMIT)).micros);
            setProgress({ done: ++done, total });
          }
          times.sort((x, y) => x - y);
          setRows((r) => [...r, { set: s.name, algo: a.index, median: percentile(times, 50), p95: percentile(times, 95), n: times.length }]);
        }
      }
    } catch (e) {
      if ((e as Error).message !== "cancelled") setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }

  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  const th = "label px-3 py-2 text-left text-ink-2";
  const td = "condensed px-3 py-2 text-[16px]";

  // Every set and solver is listed from the start: native medians now, this browser's after a run.
  const measured = new Map(rows.map((r) => [`${r.set}-${r.algo}`, r]));
  const names = sets?.map((x) => x.name) ?? Object.keys(NATIVE);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-12 sm:pt-8">
      <h1 className="semi-condensed text-[28px] leading-tight font-bold lg:text-[44px]">Bench</h1>
      <p className="mt-3 max-w-[60ch] text-[16px] text-ink-2">
        The benchmark corpus, solved here as WebAssembly, next to the native Rust medians. Run it to fill in this device’s
        column; it takes about a minute.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {progress ? (
          <>
            <button type="button" onClick={cancel} className="h-10 border border-ink px-4 font-semibold">
              Stop
            </button>
            <p role="status" className="condensed text-[18px]">
              {count(progress.done)} of {count(progress.total)} solves timed
            </p>
          </>
        ) : (
          <button type="button" onClick={() => void run()} disabled={!sets} className="h-10 bg-signal px-5 font-semibold text-on-signal disabled:opacity-40">
            {rows.length ? "Run again" : "Run the bench"}
          </button>
        )}
        <p className="text-[15px] text-ink-2">
          {sets ? `${count(sets.reduce((n, x) => n + x.puzzles.length, 0))} puzzles in ${sets.length} sets.` : "Loading the corpus…"}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 overflow-x-auto border-t border-ink" tabIndex={0} role="region" aria-label="Benchmark results">
        <table className="w-full min-w-[600px] border-collapse">
          <caption className="sr-only">Median and p95 time per solve, in this browser and native</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className={th}>Set</th>
              <th scope="col" className={th}>Solver</th>
              <th scope="col" className={`${th} text-right`}>This browser, median</th>
              <th scope="col" className={`${th} text-right`}>p95</th>
              <th scope="col" className={`${th} text-right`}>Native median</th>
              <th scope="col" className={`${th} text-right`}>Browser ÷ native</th>
            </tr>
          </thead>
          <tbody>
            {names.flatMap((name) =>
              ALGORITHMS.map((a) => {
                const r = measured.get(`${name}-${a.index}`);
                const native = NATIVE[name]?.[a.index];
                return (
                  <tr key={`${name}-${a.index}`} className="border-b border-rule">
                    <th scope="row" className={`${td} text-left font-semibold`}>
                      {name} {r && <span className="font-normal text-ink-2">({r.n})</span>}
                    </th>
                    <td className={td}>{a.code}</td>
                    <td className={`${td} text-right font-semibold`}>{r ? duration(r.median) : <span className="font-normal text-ink-2">Not run yet</span>}</td>
                    <td className={`${td} text-right`}>{r ? duration(r.p95) : "–"}</td>
                    <td className={`${td} text-right text-ink-2`}>{native ? duration(native) : "–"}</td>
                    <td className={`${td} text-right`}>{r && native ? `${(r.median / native).toFixed(2)}×` : "–"}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid max-w-[72ch] gap-3 text-[15px] text-ink-2">
        <p>
          How it’s measured: each puzzle is solved repeatedly in a worker until the batch takes at least 10 ms, then divided;
          the table shows the median and p95 over the puzzles. Timer:{" "}
          {isolated ? "cross-origin isolated, fine resolution." : "not isolated, coarse resolution (batching compensates)."}
        </p>
        <p>
          Native medians come from{" "}
          <a href="https://github.com/DhruvGoyal404/gridrace/blob/main/docs/BENCHMARKS.md">docs/BENCHMARKS.md</a>: the fastest of
          3 to 5 single solves, one pinned core of an i5-1235U. The methods differ, so the ratio is not a like-for-like race;
          the gaps between solvers are what compare.
        </p>
      </div>
    </div>
  );
}
