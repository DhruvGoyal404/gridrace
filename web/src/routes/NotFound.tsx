import type { Route } from "../lib/browser";

const DEPARTURES: { to: Route; name: string; what: string }[] = [
  { to: "/", name: "Race", what: "Four solvers race on one puzzle, every node counted" },
  { to: "/play", name: "Play", what: "A puzzle with hints that explain why" },
  { to: "/bench", name: "Bench", what: "The benchmark corpus, timed in your browser" },
];

/** Any path that isn't a route: served by Cloudflare Pages as 404.html with status 404. */
export function NotFound({ go }: { go: (to: Route) => void }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-12 sm:pt-8">
      <div className="flex gap-[3px]" aria-hidden="true">
        {"404".split("").map((ch, i) => (
          <span key={i} className="tile condensed grid h-16 w-12 place-items-center bg-flap text-[44px] font-bold text-danger">
            <span>{ch}</span>
          </span>
        ))}
      </div>
      <h1 className="semi-condensed mt-6 text-[28px] leading-tight font-bold lg:text-[44px]">No such departure.</h1>
      <p className="mt-2 max-w-[60ch] text-[16px] text-ink-2">
        Nothing leaves from <code className="condensed break-all text-ink">{location.pathname}</code>. These do:
      </p>
      <ul className="mt-6 max-w-[720px] border-t-2 border-ink">
        {DEPARTURES.map((d) => (
          <li key={d.to} className="border-b border-rule">
            <a
              href={d.to}
              onClick={(e) => {
                e.preventDefault();
                go(d.to);
              }}
              className="grid grid-cols-[72px_1fr_auto] items-center gap-3 py-3 no-underline hover:bg-flap"
            >
              <span className="semi-condensed text-[18px] font-bold text-ink">{d.name}</span>
              <span className="text-[15px] text-ink-2">{d.what}</span>
              <span className="label border-b-2 border-ink text-ink">Boarding</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
