import { type CSSProperties, useState } from "react";

import type { SliderProps } from "./slider-props.ts";

/**
The web slider is the browser's own range input (styled in `global.css` by its `data-pace-slider` attribute): drag, click on the
track, arrow keys and screen readers come with it. The value is committed on release; while
it moves, `onSlide` reports every step so the readouts follow the thumb.
*/
export const Slider = ({ label, max, onChange, onSlide, value }: SliderProps) => {
  const [draft, setDraft] = useState<null | number>(null);
  const shown = draft ?? value;
  const commit = (): void => {
    // `value` follows the thumb while it moves (the readouts), so every release is reported.
    if (draft !== null) {
      onChange(draft);
    }
    setDraft(null);
    onSlide?.(null);
  };
  return (
    <input
      aria-label={label}
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
