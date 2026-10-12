export type SliderProps = {
  readonly label: string;
  /** Whole steps from 0 to `max`. */
  readonly max: number;
  readonly value: number;
  /** Called once the finger lets go (or a key or a screen reader steps), with its step: the parent skips one it already has. */
  readonly onChange: (value: number) => void;
  /** The step under the finger while it moves, `null` once it lets go: for live readouts. */
  readonly onSlide?: ((value: null | number) => void) | undefined;
};
