/** One authored icon set: 20px grid, 1.75 stroke, square caps, matching the board's flat rules. */
const PATHS = {
  play: "M6 4.5v11l9-5.5z",
  pause: "M6.5 4.5v11M13.5 4.5v11",
  stepBack: "M5.5 4.5v11M15 4.5l-7 5.5 7 5.5z",
  stepForward: "M14.5 4.5v11M5 4.5l7 5.5-7 5.5z",
  undo: "M7.5 6 4 9.5 7.5 13M4 9.5h8a4 4 0 0 1 0 8H9",
  redo: "M12.5 6 16 9.5 12.5 13M16 9.5H8a4 4 0 0 0 0 8h3",
  pencil: "M13.5 3.5l3 3L7 16H4v-3zM11.5 5.5l3 3",
  sun: "M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4",
  moon: "M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z",
  paste: "M7 4H5v13h10V4h-2M7 3h6v3H7z",
  bulb: "M7.5 14.5h5M8 17h4M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z",
  check: "M4 10.5l4 4 8-9",
  shuffle: "M3 6h3l8 8h3M3 14h3l2-2M12 8l2-2h3M15 4l2 2-2 2M15 12l2 2-2 2",
  close: "M5 5l10 10M15 5L5 15",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const filled = name === "play" || name === "stepBack" || name === "stepForward";
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 1 : 1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
