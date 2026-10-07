import { addMinutesIso, type QueryContext, startOfDayIn, type Task } from "@pace/core";

/** Where the client reads the time from; tests pass a frozen one. */
export type Clock = {
  readonly now: () => string;
  /** IANA zone of this device. */
  readonly deviceTz: string;
};

export const systemClock = (): Clock => ({
  deviceTz: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  now: () => new Date().toISOString(),
});

/** A snapshot of the clock: what every query takes. */
export const queryContext = (clock: Clock): QueryContext => ({
  deviceTz: clock.deviceTz,
  now: clock.now(),
});

export type QuickTimeKey = "at-deadline" | "hour-ago" | "now" | "yesterday-evening";

export type QuickTime = {
  readonly key: QuickTimeKey;
  readonly at: string;
};

/** "Yesterday evening" is 21:00, three hours before today's midnight on the device's calendar. */
const EVENING_BEFORE_MIDNIGHT_MINUTES = 3 * 60;

/**
The retro pills of the close sheet. Yesterday 21:00 is counted back from today's start in
the device zone, so a summer-time change earlier that day cannot shift it; "end of last
focus" joins with stage 3.
*/
export const quickTimes = (clock: Clock, task: null | Task): readonly QuickTime[] => {
  const now = clock.now();
  const deadline = task?.dueAt ?? null;
  return [
    { at: now, key: "now" },
    { at: addMinutesIso(now, -60), key: "hour-ago" },
    {
      at: addMinutesIso(startOfDayIn(now, clock.deviceTz), -EVENING_BEFORE_MIDNIGHT_MINUTES),
      key: "yesterday-evening",
    },
    ...(deadline === null ? [] : [{ at: deadline, key: "at-deadline" as const }]),
  ];
};
