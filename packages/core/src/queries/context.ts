import type { CoreState } from "../materialize/core-state.ts";

/** What every query needs besides the state: the instant it answers for and the device zone. */
export type QueryContext = {
  readonly now: string;
  /** IANA zone of the device asking; the fallback until the account has its own zone. */
  readonly deviceTz: string;
};

/** "End of the day" and date words are read in this zone. */
export const accountTz = (state: CoreState, ctx: QueryContext): string =>
  state.settings.timezone ?? ctx.deviceTz;
