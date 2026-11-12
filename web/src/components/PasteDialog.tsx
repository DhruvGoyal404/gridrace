import { useEffect, useId, useRef, useState } from "react";
import { engine } from "../engine/client";
import type { Analysis } from "../engine/protocol";
import { cellName } from "../lib/sudoku";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with a puzzle that has exactly one solution. */
  onLoad: (puzzle: string, analysis: Analysis) => void;
}

type Check = { state: "idle" } | { state: "checking" } | { state: "ok"; a: Analysis } | { state: "bad"; message: string };

function describe(a: Analysis): Check {
  if (a.conflicts.length) {
    const [x, y] = a.conflicts[0]!;
    return { state: "bad", message: `${cellName(x)} and ${cellName(y)} both hold ${a.puzzle[x]}, so it can't be solved.` };
  }
  if (a.solutions === 0) return { state: "bad", message: "No digits clash, but the puzzle has no solution." };
  if (a.solutions > 1)
    return { state: "bad", message: `More than one solution: a Sudoku needs exactly one. It has ${a.givens} givens; add more.` };
  return { state: "ok", a };
}

/** Paste an 81-character puzzle: validated live, explained when it can't be played. */
export function PasteDialog({ open, onClose, onLoad }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  // The last finished check and the text it was for; a different text means "checking".
  const [checked, setChecked] = useState<{ text: string; check: Check }>({ text: "", check: { state: "idle" } });
  const id = useId();
  const blank = text.replace(/\s/g, "") === "";
  const check: Check = blank ? { state: "idle" } : checked.text === text ? checked.check : { state: "checking" };

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (text.replace(/\s/g, "") === "") return;
    let live = true;
    engine()
      .analyze(text)
      .then((a) => live && setChecked({ text, check: describe(a) }))
      .catch(
        (e: Error) => live && setChecked({ text, check: { state: "bad", message: `${e.message[0]!.toUpperCase()}${e.message.slice(1)}.` } }),
      );
    return () => {
      live = false;
    };
  }, [text]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-md border border-rule bg-panel p-0 text-ink backdrop:bg-black/60"
    >
      <form
        method="dialog"
        className="grid gap-4 p-6"
        onSubmit={(e) => {
          if (check.state !== "ok") {
            e.preventDefault();
            return;
          }
          onLoad(check.a.puzzle, check.a);
          setText("");
        }}
      >
        <h2 id={`${id}-title`} className="semi-condensed text-[22px] font-bold">
          Paste a puzzle
        </h2>
        <label htmlFor={`${id}-text`} className="text-[15px] text-ink-2">
          81 characters, row by row: digits 1 to 9, and 0 or a dot for an empty cell. Spaces and line breaks are ignored.
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          aria-describedby={`${id}-status`}
          className="condensed w-full resize-none border border-ink bg-flap p-3 text-[18px] tracking-[0.08em] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          placeholder="53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79"
        />
        <p id={`${id}-status`} role="status" className={`min-h-6 text-[15px] ${check.state === "bad" ? "text-danger" : "text-ink-2"}`}>
          {check.state === "checking" && "Checking..."}
          {check.state === "bad" && check.message}
          {check.state === "ok" && `One solution. ${check.a.givens} givens, graded ${check.a.difficulty}${check.a.hardest ? ` (needs ${check.a.hardest})` : ""}.`}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 border border-ink px-4 font-semibold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={check.state !== "ok"}
            className="h-10 bg-signal px-5 font-semibold text-on-signal disabled:opacity-40"
          >
            Load puzzle
          </button>
        </div>
      </form>
    </dialog>
  );
}
