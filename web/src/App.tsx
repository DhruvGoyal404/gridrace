import { useEffect, useState } from "react";
import { PasteDialog } from "./components/PasteDialog";
import { TopBar } from "./components/TopBar";
import { engine } from "./engine/client";
import { TIERS } from "./engine/protocol";
import { useIsNight, useRoute, useTheme } from "./lib/browser";
import { Bench } from "./routes/Bench";
import { Play } from "./routes/Play";
import { DEFAULT_PUZZLE, type PuzzleMeta, Race } from "./routes/Race";

const DEFAULT_META: PuzzleMeta = { puzzle: DEFAULT_PUZZLE, difficulty: "Expert", hardest: "XY-Wing", seed: 18 };

/** Race puzzle from the address: ?p=<81 chars> or ?seed=<n>&tier=<name>. */
function fromUrl(): Promise<PuzzleMeta> | null {
  const q = new URLSearchParams(location.search);
  const p = q.get("p");
  if (p) {
    return engine()
      .analyze(p)
      .then((a) => ({ puzzle: a.puzzle, difficulty: a.difficulty, hardest: a.hardest, seed: null }));
  }
  const seed = Number(q.get("seed"));
  const tier = TIERS.findIndex((t) => t.toLowerCase() === (q.get("tier") ?? "").toLowerCase());
  if (Number.isInteger(seed) && seed >= 0 && tier >= 0) {
    return engine()
      .generate(tier, seed)
      .then((g) => ({ puzzle: g.puzzle, difficulty: g.difficulty, hardest: g.hardest, seed: g.seed }));
  }
  return null;
}

export function App() {
  const [route, go] = useRoute();
  const [theme, setTheme] = useTheme();
  const night = useIsNight(theme);
  const [meta, setMeta] = useState<PuzzleMeta>(DEFAULT_META);
  const [pasting, setPasting] = useState(false);
  // Bumped when a puzzle is handed to Play, so it remounts and reads ?p= again.
  const [playKey, setPlayKey] = useState(0);
  const play = (puzzle: string) => {
    go("/play", `?p=${puzzle}`);
    setPlayKey((k) => k + 1);
  };

  useEffect(() => {
    if (location.pathname === "/") fromUrl()?.then(setMeta, () => undefined);
  }, []);

  // The crawlable explainer in index.html belongs to the landing route only.
  useEffect(() => {
    const explainer = document.getElementById("explainer");
    if (explainer) explainer.hidden = route !== "/";
    document.title = { "/": "GridRace: four Sudoku solvers, raced", "/play": "Play Sudoku with explained hints | GridRace", "/bench": "In-browser benchmark | GridRace" }[route];
  }, [route]);

  function race(m: PuzzleMeta) {
    setMeta(m);
    if (route !== "/") go("/");
    history.replaceState(null, "", m.seed !== null && m.difficulty ? `/?seed=${m.seed}&tier=${m.difficulty.toLowerCase()}` : `/?p=${m.puzzle}`);
  }

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-signal focus:p-3 focus:text-on-signal">
        Skip to content
      </a>
      <TopBar route={route} go={go} theme={theme} night={night} setTheme={setTheme} onPaste={() => setPasting(true)} />
      <main id="main">
        {route === "/" && <Race meta={meta} setMeta={race} onPlay={play} />}
        {route === "/play" && <Play key={playKey} />}
        {route === "/bench" && <Bench />}
      </main>
      <PasteDialog
        open={pasting}
        onClose={() => setPasting(false)}
        onLoad={(puzzle, a) => {
          setPasting(false);
          if (route === "/play") play(puzzle);
          else race({ puzzle, difficulty: a.difficulty, hardest: a.hardest, seed: null });
        }}
      />
    </>
  );
}
