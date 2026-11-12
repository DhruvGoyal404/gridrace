import { Icon } from "./Icon";

export const SPEEDS = [
  { label: "0.25×", perSecond: 2 },
  { label: "1×", perSecond: 8 },
  { label: "4×", perSecond: 32 },
  { label: "16×", perSecond: 128 },
  { label: "Max", perSecond: 4000 },
] as const;

interface Props {
  position: number;
  total: number;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onStep: (delta: number) => void;
  onSeek: (position: number) => void;
  onSpeed: (speed: number) => void;
  disabled?: boolean;
}

/** Replay controls: step, play/pause, speed, and a scrubber over the trace's events. */
export function Transport({ position, total, playing, speed, onPlay, onStep, onSeek, onSpeed, disabled }: Props) {
  const btn = "grid size-10 place-items-center border border-rule bg-panel text-ink hover:border-ink disabled:opacity-40";
  return (
    <div className="grid gap-2" aria-label="Replay controls" role="group">
      <div className="flex items-center gap-1">
        <button type="button" className={btn} onClick={() => onStep(-1)} disabled={disabled || position === 0} aria-label="Step back">
          <Icon name="stepBack" />
        </button>
        <button
          type="button"
          className="grid h-10 w-14 place-items-center bg-signal text-on-signal disabled:opacity-40"
          onClick={onPlay}
          disabled={disabled}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button type="button" className={btn} onClick={() => onStep(1)} disabled={disabled || position >= total} aria-label="Step forward">
          <Icon name="stepForward" />
        </button>
        <label className="ml-2 flex items-center gap-2 text-[14px] text-ink-2">
          <span className="label">Speed</span>
          <select
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
            disabled={disabled}
            className="h-10 border border-rule bg-panel px-2 text-[15px] font-semibold text-ink"
          >
            {SPEEDS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        type="range"
        min={0}
        max={total}
        value={position}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={disabled}
        aria-label="Replay position"
        aria-valuetext={`Event ${position} of ${total}`}
        className="h-6 w-full accent-[var(--signal)]"
      />
    </div>
  );
}
