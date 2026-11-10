import type { CSSProperties } from "react";

import { type SliderProps, useShownStep } from "./slider-props.ts";

/**
The web slider is the browser's own range input (styled in `global.css` by its `data-pace-slider`
attribute: a 4 high track and an equal 24 thumb in WebKit and Firefox, F-A11Y-16): drag, click on
the track, arrow keys and screen readers come with it. The value is committed on release and held
until the store answers, so it never snaps back; while it moves, `onSlide` reports every step so
the readouts follow the thumb. `aria-valuetext` says the readout's words («30 %»).
*/
export const Slider = ({ label, max, onChange, onSlide, value, valueText }: SliderProps) => {
  const { draft, release, setDraft, shown } = useShownStep(value);
  const commit = (): void => {
    // `value` follows the thumb while it moves (the readouts), so every release is reported.
    if (draft !== null) {
      release(draft);
      onChange(draft);
    }
    setDraft(null);
    onSlide?.(null);
  };
  return (
    <input
      aria-label={label}
      {...(valueText !== undefined && { "aria-valuetext": valueText(shown) })}
      data-pace-slider
      max={max}
      min={0}
      onBlur={commit}
      onChange={(event) => {
        const next = Number(event.target.value);
        setDraft(next);
        onSlide?.(next);
      }}
      onKeyUp={commit}
      onPointerUp={commit}
      step={1}
      style={{ "--pace-share": `${String(max === 0 ? 0 : (shown / max) * 100)}%` } as CSSProperties}
      type="range"
      value={shown}
    />
  );
};
