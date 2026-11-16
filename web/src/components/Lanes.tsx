import { ALGORITHMS, type AlgoIndex, type Timed } from "../engine/protocol";
import { count, duration } from "../lib/format";

export type LaneState =
  | { status: "boarding" }
  | { status: "searching" }
  | { status: "done"; result: Timed }
  | { status: "error"; message: string };

const HUE = ["text-brt", "text-bit", "text-mrv", "text-dlx"] as const;
const BAR = ["bg-brt", "bg-bit", "bg-mrv", "bg-dlx"] as const;

interface Props {
  lanes: LaneState[];
  selected: AlgoIndex;
  onSelect: (algo: AlgoIndex) => void;
  nodeLimit: number;
}

function Status({ lane }: { lane: LaneState }) {
  // State is a word plus a form: dashed, blinking, solid, struck (DESIGN.md, "Lane").
  switch (lane.status) {
    case "boarding":
      return <span className="label border-b border-dashed border-ink-2 text-ink-2">Boarding</span>;
    case "searching":
      return (
        <span className="label flex items-center gap-1.5 text-ink">
          <span className="blink size-2 rounded-full bg-signal" aria-hidden="true" />
          Searching
        </span>
      );
    case "error":
      return <span className="label text-danger">Error</span>;
    case "done":
      return lane.result.aborted ? (
        <span className="label text-danger line-through decoration-2">Gave up</span>
      ) : (
        <span className="label border-b-2 border-ink text-ink">Arrived</span>
      );
  }
}

/** The departure board: one row per solver, every number measured in this browser. */
const ORDINAL = ["1st", "2nd", "3rd", "4th"];

export function Lanes({ lanes, selected, onSelect, nodeLimit }: Props) {
  const logMax = Math.log10(nodeLimit);
  // Arrival order by measured time per solve; a solver that gave up has no place.
  const arrived = lanes
    .map((l, i) => ({ i, micros: l.status === "done" && !l.result.aborted ? l.result.micros : Infinity }))
    .filter((x) => x.micros < Infinity)
    .sort((a, b) => a.micros - b.micros)
    .map((x) => x.i);
  return (
    <div role="radiogroup" aria-label="Solvers. Choose one to replay its search." className="border-t border-rule">
      {ALGORITHMS.map((a, i) => {
        const lane = lanes[i] ?? { status: "boarding" };
        const r = lane.status === "done" ? lane.result : null;
        const nodes = r?.stats.nodes ?? 0;
        const on = selected === a.index;
        return (
          <button
            key={a.code}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(a.index)}
            className={[
              "grid w-full grid-cols-[52px_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-rule px-3 py-2.5 text-left",
              "sm:grid-cols-[56px_minmax(0,1fr)_96px_86px]",
              on ? "bg-flap" : "hover:bg-flap",
            ].join(" ")}
          >
            <span
              className={`condensed grid h-8 place-items-center text-[18px] font-bold ${on ? "bg-signal text-on-signal" : HUE[i]}`}
            >
              {a.code}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-semibold text-ink">{a.name}</span>
                {on && <span className="label text-ink-2">Replaying</span>}
              </span>
              <span className="mt-1 block h-1.5 bg-rule" aria-hidden="true">
                <span
                  className={`block h-full ${BAR[i]}`}
                  style={{ width: `${nodes ? Math.max(2, (Math.log10(nodes + 1) / logMax) * 100) : 0}%` }}
                />
              </span>
            </span>
            <span className="flex items-baseline gap-2 justify-self-end sm:justify-self-start">
              <Status lane={lane} />
              {arrived.includes(i) && (
                <span className="condensed text-[15px] font-bold text-ink">{ORDINAL[arrived.indexOf(i)]}</span>
              )}
            </span>
            <span className="condensed col-span-3 text-[18px] font-semibold text-ink sm:col-span-1 sm:text-right">
              {r ? duration(r.micros) : "–"}
            </span>
            <span className="condensed col-span-3 grid grid-cols-3 gap-2 text-[14px] text-ink-2 sm:col-span-4 sm:gap-4 sm:pl-[68px]">
              <span>
                <span className="font-semibold text-ink">{r ? count(nodes) : "–"}</span> nodes
              </span>
              <span>
                <span className="font-semibold text-ink">{r ? count(r.stats.backtracks) : "–"}</span> backtracks
              </span>
              <span>
                <span className="font-semibold text-ink">{r ? count(r.stats.checks) : "–"}</span> checks
              </span>
            </span>
            {lane.status === "error" && <span className="col-span-4 text-[14px] text-danger">{lane.message}</span>}
            {r?.aborted && (
              <span className="col-span-4 text-[14px] text-danger">Stopped at the {count(nodeLimit)}-node limit.</span>
            )}
          </button>
        );
      })}
      <p className="px-3 pt-2 text-[13px] text-ink-2">
        Bars: nodes on a log scale, full width = the {count(nodeLimit)}-node limit. Times are per solve, measured here, without
        recording the trace.
      </p>
    </div>
  );
}
