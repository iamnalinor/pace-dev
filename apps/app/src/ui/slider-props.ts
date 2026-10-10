export type SliderProps = {
  readonly label: string;
  /** Whole steps from 0 to `max`. */
  readonly max: number;
  readonly value: number;
  /** Called once the finger lets go (or a key or a screen reader steps), with the new step. */
  readonly onChange: (value: number) => void;
};
