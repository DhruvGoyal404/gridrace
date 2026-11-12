import type { Route, Theme } from "../lib/browser";
import { Icon } from "./Icon";

const NAV: { to: Route; label: string }[] = [
  { to: "/", label: "Race" },
  { to: "/play", label: "Play" },
  { to: "/bench", label: "Bench" },
];

interface Props {
  route: Route;
  go: (to: Route) => void;
  theme: Theme;
  night: boolean;
  setTheme: (t: Theme) => void;
  onPaste: () => void;
}

export function TopBar({ route, go, night, setTheme, onPaste }: Props) {
  return (
    <header className="border-b border-rule bg-panel">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4 sm:gap-8">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go("/");
          }}
          className="condensed flex items-center gap-[3px] text-lg font-bold no-underline"
          aria-label="GridRace, home"
        >
          {"GRIDRACE".split("").map((ch, i) => (
            <span key={i} className="tile grid h-7 w-[18px] place-items-center bg-ink text-panel" aria-hidden="true">
              {ch}
            </span>
          ))}
        </a>
        <nav aria-label="Main" className="flex gap-4 sm:gap-6">
          {NAV.map((n) => (
            <a
              key={n.to}
              href={n.to}
              aria-current={route === n.to ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(n.to);
              }}
              className={[
                "semi-condensed py-4 text-[15px] font-semibold no-underline",
                route === n.to ? "text-ink shadow-[inset_0_-3px_0_var(--signal)]" : "text-ink-2 hover:text-ink",
              ].join(" ")}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onPaste}
            className="flex h-10 items-center gap-2 px-2 text-[15px] font-semibold text-ink-2 hover:text-ink sm:px-3"
          >
            <Icon name="paste" />
            <span className="hidden sm:inline">Paste puzzle</span>
            <span className="sr-only sm:hidden">Paste puzzle</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme(night ? "enamel" : "night")}
            className="grid size-10 place-items-center text-ink-2 hover:text-ink"
            aria-label={night ? "Switch to the light board" : "Switch to the dark board"}
          >
            <Icon name={night ? "sun" : "moon"} />
          </button>
        </div>
      </div>
    </header>
  );
}
