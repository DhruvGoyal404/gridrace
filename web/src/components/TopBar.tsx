import type { Page, Route, Theme } from "../lib/browser";
import { Icon } from "./Icon";

const NAV: { to: Route; label: string }[] = [
  { to: "/", label: "Race" },
  { to: "/play", label: "Play" },
  { to: "/bench", label: "Bench" },
];

interface Props {
  route: Page;
  go: (to: Route) => void;
  theme: Theme;
  night: boolean;
  setTheme: (t: Theme) => void;
  onPaste: () => void;
}

export function TopBar({ route, go, night, setTheme, onPaste }: Props) {
  return (
    <header className="border-b border-rule bg-panel">
      {/* Phones: wordmark and actions on one row, the nav full width below. */}
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 px-4 pt-2 sm:h-14 sm:flex-nowrap sm:gap-8 sm:pt-0">
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
            <span key={i} className="grid h-7 w-[18px] place-items-center bg-ink text-panel" aria-hidden="true">
              <span>{ch}</span>
            </span>
          ))}
        </a>
        <nav aria-label="Main" className="order-last flex w-full gap-6 sm:order-none sm:w-auto">
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
                "semi-condensed py-3 text-[15px] font-semibold no-underline sm:py-4",
                route === n.to ? "text-ink shadow-[inset_0_-3px_0_var(--signal)]" : "text-ink-2 hover:text-ink",
              ].join(" ")}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <a
            href="https://github.com/DhruvGoyal404/gridrace"
            className="hidden h-10 items-center px-3 text-[15px] font-semibold text-ink-2 hover:text-ink sm:flex"
          >
            Source
          </a>
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
