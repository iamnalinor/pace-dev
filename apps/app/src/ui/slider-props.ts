import { useEffect, useRef, useState } from "react";

export type SliderProps = {
  readonly label: string;
  /** Whole steps from 0 to `max`. */
  readonly max: number;
  readonly value: number;
  /** Called once the finger lets go (or a key or a screen reader steps), with its step: the parent skips one it already has. */
  readonly onChange: (value: number) => void;
  /** The step under the finger while it moves, `null` once it lets go: for live readouts. */
  readonly onSlide?: ((value: null | number) => void) | undefined;
  /** A step as the readout says it («30 %»): the slider's `aria-valuetext` (F-A11Y-16). */
  readonly valueText?: ((value: number) => string) | undefined;
};

/**
The step a slider shows: the finger's while it moves, then the one it let go on until the store
answers with a new `value` (owner, feedback-3: "дергается после сохранения" — it jumped back to
the old value for a moment after a release), then `value`.
*/
export const useShownStep = (value: number) => {
  const [draft, setDraft] = useState<null | number>(null);
  const [held, setHeld] = useState<null | number>(null);
  const seenRef = useRef(value);
  useEffect(() => {
    if (seenRef.current === value) {
      return;
    }

    seenRef.current = value;
    setHeld(null);
  }, [value]);
  const release = (step: number): void => {
    setHeld(step === value ? null : step);
    setDraft(null);
  };
  return { draft, release, setDraft, shown: draft ?? held ?? value };
};
