import type { AlgoIndex, Analysis, Generated, HintResult, Request, Response, TimeResult, Timed } from "./protocol";

/** One worker with a request/response queue. `terminate` cancels everything in flight. */
export class Engine {
  private worker: Worker;
  private next = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<Response>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.value);
      else p.reject(new Error(e.data.error));
    };
  }

  private call<T>(req: Request): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, req });
    });
  }

  analyze = (text: string) => this.call<Analysis>({ type: "analyze", text });
  race = (puzzle: string, algo: AlgoIndex, nodeLimit: number, traceCap: number) =>
    this.call<Timed>({ type: "race", puzzle, algo, nodeLimit, traceCap });
  time = (puzzle: string, algo: AlgoIndex, nodeLimit: number) =>
    this.call<TimeResult>({ type: "time", puzzle, algo, nodeLimit });
  generate = (tier: number, seed: number) => this.call<Generated>({ type: "generate", tier, seed });
  hint = (givens: string, current: string) => this.call<HintResult>({ type: "hint", givens, current });

  terminate() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error("cancelled"));
    this.pending.clear();
  }
}

let shared: Engine | null = null;

/** The worker for one-off calls (analyze, generate, hint). */
export function engine(): Engine {
  shared ??= new Engine();
  return shared;
}
