/** A closed task of the same preset that took about this long, for the Add form's buckets. */
export type EstimateSample = {
  readonly title: string;
  readonly actualMinutes: number;
};

export type EstimateBucket = {
  readonly minutes: number;
  readonly samples: readonly EstimateSample[];
};

/** Port filled by the time ledger of stage 3; until then every bucket is empty. */
export type EstimateHints = {
  readonly bucketsFor: (presetId: string) => readonly EstimateBucket[];
};

export const ESTIMATE_BUCKET_MINUTES: readonly number[] = [15, 30, 60, 90, 120, 180, 300, 480];

export const defaultEstimateHints: EstimateHints = {
  bucketsFor: () => ESTIMATE_BUCKET_MINUTES.map((minutes) => ({ minutes, samples: [] })),
};
