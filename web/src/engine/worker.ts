/// <reference lib="webworker" />
// The solver worker: WebAssembly runs here so the page never freezes. Timing happens here
// too, with performance.now(), because the core has no clock.
import init, { analyze, generate, hint, solve_repeat, solve_traced } from "../wasm/gridrace_wasm.js";
import wasmUrl from "../wasm/gridrace_wasm_bg.wasm?url";
import type { Request, Response, Solved, TimeResult, Timed } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const ready = init({ module_or_path: wasmUrl });

/** Repeats the solve until the batch takes at least `minMs`, then divides. */
function time(puzzle: string, algo: number, nodeLimit: number, minMs: number): TimeResult {
  let reps = 1;
  for (;;) {
    const start = performance.now();
    const nodes = solve_repeat(puzzle, algo, nodeLimit, reps);
    const ms = performance.now() - start;
    if (nodes < 0) throw new Error("invalid puzzle");
    if (ms >= minMs || reps >= 1 << 20) {
      return { micros: (ms * 1000) / reps, reps, nodes, aborted: nodeLimit > 0 && nodes > nodeLimit };
    }
    reps *= ms < minMs / 16 ? 16 : 4;
  }
}

function parse<T>(json: string): T {
  const value = JSON.parse(json) as T & { error?: string };
  if (value.error) throw new Error(value.error);
  return value;
}

function handle(req: Request): { value: unknown; transfer: Transferable[] } {
  switch (req.type) {
    case "analyze":
      return { value: parse(analyze(req.text)), transfer: [] };
    case "race": {
      const out = solve_traced(req.puzzle, req.algo, req.nodeLimit, req.traceCap);
      const solved = parse<Solved>(out.json);
      const trace = out.trace;
      out.free();
      // The traced run pays for recording; time the plain solve separately.
      const timing = time(req.puzzle, req.algo, req.nodeLimit, 15);
      const value: Timed = { ...solved, micros: timing.micros, reps: timing.reps, trace };
      return { value, transfer: [trace.buffer] };
    }
    case "time":
      return { value: time(req.puzzle, req.algo, req.nodeLimit, 10), transfer: [] };
    case "generate":
      return { value: parse(generate(req.tier, req.seed, 4000)), transfer: [] };
    case "hint":
      return { value: parse(hint(req.givens, req.current)), transfer: [] };
  }
}

self.onmessage = async (event: MessageEvent<{ id: number; req: Request }>) => {
  const { id, req } = event.data;
  await ready;
  try {
    const { value, transfer } = handle(req);
    self.postMessage({ id, ok: true, value } satisfies Response, transfer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, ok: false, error: message } satisfies Response);
  }
};
