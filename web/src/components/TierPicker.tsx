import { useId } from "react";
import { TIERS } from "../engine/protocol";

interface Props {
  tier: number;
  onTier: (tier: number) => void;
  legend?: string;
}

/** Difficulty tiers as a native radio group, drawn as board plates. */
export function TierPicker({ tier, onTier, legend = "Difficulty" }: Props) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="label mb-2 text-ink-2">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {TIERS.map((t, i) => (
          <label key={t} className="relative">
            <input
              type="radio"
              name={name}
              value={i}
              checked={tier === i}
              onChange={() => onTier(i)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            <span className="semi-condensed flex h-9 items-center border border-rule bg-panel px-3 text-[14px] font-semibold text-ink-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-panel peer-hover:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
              {t}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
