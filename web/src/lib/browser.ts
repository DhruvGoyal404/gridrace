import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** localStorage that never throws: private windows and blocked storage just forget. */
export const store = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the game still works, it just isn't remembered.
    }
  },
};

export type Theme = "system" | "night" | "enamel";

/** The board theme. "system" follows prefers-color-scheme; a choice is remembered. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => store.get<Theme>("gridrace.theme") ?? "system");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    store.set("gridrace.theme", theme);
  }, [theme]);
  return [theme, setTheme];
}

/** True when the page is showing the dark board, whatever chose it. */
export function useIsNight(theme: Theme): boolean {
  const system = useSyncExternalStore(
    (cb) => {
      const m = matchMedia("(prefers-color-scheme: dark)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  return theme === "night" || (theme === "system" && system);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}

export const ROUTES = ["/", "/play", "/bench"] as const;
export type Route = (typeof ROUTES)[number];

function current(): Route {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : "/";
}

/** History-API routing for three routes; no router dependency needed. */
export function useRoute(): [Route, (to: Route, search?: string) => void] {
  const route = useSyncExternalStore(
    (cb) => {
      addEventListener("popstate", cb);
      return () => removeEventListener("popstate", cb);
    },
    current,
  );
  const go = useCallback((to: Route, search = "") => {
    history.pushState(null, "", to + search);
    dispatchEvent(new PopStateEvent("popstate"));
    scrollTo({ top: 0 });
  }, []);
  return [route, go];
}
