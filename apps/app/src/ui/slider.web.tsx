import { type CSSProperties, useState } from "react";

import type { SliderProps } from "./slider-props.ts";

/**
The web slider is the browser's own range input (styled in `global.css` by its `data-pace-slider` attribute): drag, click on the
track, arrow keys and screen readers come with it. The value is committed on release.
*/
export const Slider = ({ label, max, onChange, value }: SliderProps) => {
  const [draft, setDraft] = useState<null | number>(null);
  const shown = draft ?? value;
  const commit = (): void => {
    if (draft !== null && draft !== value) {
      onChange(draft);
    }
    setDraft(null);
  };
  return (
    <input
      aria-label={label}
      data-pace-slider
      max={max}
      min={0}
      onBlur={commit}
      onChange={(event) => {
        setDraft(Number(event.target.value));
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
