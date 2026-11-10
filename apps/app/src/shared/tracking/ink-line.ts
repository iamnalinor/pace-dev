/** Where the running activity's ink line ends and its Expect mark sits, as shares of the width. */
export type InkLine = {
  /** 0..1: from the start to now. */
  readonly fill: number;
  /** 0..1: the expected length. */
  readonly mark: number;
  /** Past twice the Expect: the line turns `status.warn`. */
  readonly isPast: boolean;
};

const PAST_FACTOR = 2;

/**
The line under a running activity (spec §2 A): the width is the longer of twice the Expect and the
time so far, so the mark sits at expected / max(expected × 2, elapsed) and the line, drawn up to
now, runs out only when the activity has run twice as long as expected. `null` without an Expect.
*/
export const inkLine = (minutes: number, expectMinutes: null | number): InkLine | null => {
  if (expectMinutes === null || expectMinutes <= 0) {
    return null;
  }
  const span = Math.max(expectMinutes * PAST_FACTOR, minutes);
  return {
    fill: minutes / span,
    isPast: minutes >= expectMinutes * PAST_FACTOR,
    mark: expectMinutes / span,
  };
};
