import type { HintResult } from "../engine/protocol";
import { cellName } from "../lib/sudoku";

/** Rungs of the hint ladder, smallest nudge first (PRODUCT.md, "Capabilities"). */
export const RUNGS = ["Technique", "Where to look", "Why", "Apply"] as const;

export function unitCells(unit: string): number[] {
  const [kind, n] = unit.split(" ");
  const i = Number(n) - 1;
  const all = Array.from({ length: 81 }, (_, c) => c);
  if (kind === "row") return all.filter((c) => Math.floor(c / 9) === i);
  if (kind === "column") return all.filter((c) => c % 9 === i);
  return all.filter((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3) === i);
}

/** What the ladder shows at each level. Level 1 is the first rung. */
export function HintPanel({ hint, level }: { hint: HintResult; level: number }) {
  const line = "text-[15px] leading-relaxed text-ink";
  switch (hint.kind) {
    case "solved":
      return <p className={line}>The board is complete.</p>;
    case "conflict":
      return (
        <p className={line}>
          Two digits clash: {hint.pairs.map(([a, b]) => `${cellName(a)} and ${cellName(b)}`).join(", ")}. Fix that first.
        </p>
      );
    case "not_unique":
      return <p className={line}>This puzzle has {hint.solutions === 0 ? "no solution" : "more than one solution"}, so hints can't be trusted on it.</p>;
    case "mistakes":
      return (
        <div className="grid gap-2">
          <p className={line}>
            {hint.cells.length === 1 ? "One of your entries doesn't" : `${hint.cells.length} of your entries don't`} match the
            solution. Hints start from a correct board.
          </p>
          {level >= 2 && <p className={line}>They're marked in red: {hint.cells.map(cellName).join(", ")}.</p>}
        </div>
      );
    case "reveal":
      return (
        <div className="grid gap-2">
          <p className={line}>None of the seventeen techniques GridRace knows applies here. This one needs a guess or a longer chain.</p>
          {level >= 2 && (
            <p className={line}>
              The cell with the fewest candidates is {cellName(hint.cell)} ({hint.candidates.join(", ")}).
            </p>
          )}
          {level >= 3 && <p className={line}>The solution has {hint.digit} there.</p>}
        </div>
      );
    case "steps": {
      const first = hint.steps[0]!;
      const last = hint.steps.at(-1)!;
      return (
        <div className="grid gap-3">
          <p className={line}>
            {hint.steps.length === 1
              ? `The next digit comes from a ${first.technique.toLowerCase()}.`
              : `${hint.steps.length} deductions lead to the next digit. The first is a ${first.technique.toLowerCase()}.`}{" "}
            <span className="text-ink-2">
              {first.difficulty}, rated {first.rating}.
            </span>
          </p>
          {level >= 2 && (
            <p className={line}>
              Look at {first.unit ?? first.cells.map(cellName).join(", ")}
              {first.digits.length ? `, digit${first.digits.length > 1 ? "s" : ""} ${first.digits.join(", ")}` : ""}.
            </p>
          )}
          {level >= 3 && (
            <ol className="grid list-decimal gap-2 pl-5">
              {hint.steps.map((s, i) => (
                <li key={i} className={line}>
                  {s.explanation}
                </li>
              ))}
            </ol>
          )}
          {level >= 3 && last.place && (
            <p className="text-[15px] font-semibold text-ink">
              Place {last.place[1]} in {cellName(last.place[0])}.
            </p>
          )}
        </div>
      );
    }
  }
}
