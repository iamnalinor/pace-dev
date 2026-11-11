import { addMinutesIso } from "@pace/core";

import type { CalendarUpload, UsageUpload } from "../src/user-store/cloud-data.ts";

export type CostOptions = {
  readonly seed: string;
  readonly days: number;
  readonly history: number;
};
export type CostOperation = {
  readonly id: string;
  readonly phase: "seed" | "workload";
  readonly now: string;
} & (
  | { readonly kind: "append"; readonly input: readonly Record<string, unknown>[] }
  | { readonly kind: "calendar"; readonly input: CalendarUpload }
  | { readonly kind: "usage"; readonly input: UsageUpload }
);
export const COST_START = "2099-10-07T08:00:00.000Z";

const envelope = (
  id: string,
  { type, payload }: { readonly type: string; readonly payload: Record<string, unknown> },
  now: string,
): Record<string, unknown> => ({
  id: `auto:cost:${id}`,
  type,
  payload,
  occurredAt: now,
  recordedAt: now,
  deviceId: "cost-phone",
  precision: "exact",
  source: "app",
});
const task = (id: string, now: string): Record<string, unknown> =>
  envelope(
    id,
    {
      type: "task.created",
      payload: { taskId: id, title: `Task ${id}`, presetId: "personal", subtasks: [] },
    },
    now,
  );
const calendar = (id: string, now: string) => ({
  id,
  title: `Calendar ${id}`,
  series: null,
  startAt: addMinutesIso(now, 60),
  endAt: addMinutesIso(now, 90),
});
const usage = (now: string): UsageUpload => ({
  deviceId: "cost-phone",
  deviceName: "Fixture phone",
  isPhone: true,
  until: now,
  sessions: [{ app: "reader", startAt: addMinutesIso(now, -30), endAt: addMinutesIso(now, -10) }],
  uses: [{ startAt: addMinutesIso(now, -30), endAt: addMinutesIso(now, -10) }],
});

const dailyOperations = (seed: string, day: number): readonly CostOperation[] => {
  const id = `${seed}-day-${String(day)}`;
  const now = addMinutesIso(COST_START, day * 1440);
  const calendarInput: CalendarUpload = {
    deviceId: "cost-phone",
    from: now,
    to: addMinutesIso(now, 1440),
    events: [calendar(id, now)],
    ruledSeries: [],
  };
  const usageInput = usage(now);
  return [
    { id: `${id}-create`, phase: "workload", now, kind: "append", input: [task(id, now)] },
    {
      id: `${id}-calendar-first`,
      phase: "workload",
      now: addMinutesIso(now, 1),
      kind: "calendar",
      input: calendarInput,
    },
    {
      id: `${id}-usage-first`,
      phase: "workload",
      now: addMinutesIso(now, 2),
      kind: "usage",
      input: usageInput,
    },
    {
      id: `${id}-calendar-repeat`,
      phase: "workload",
      now: addMinutesIso(now, 15),
      kind: "calendar",
      input: calendarInput,
    },
    {
      id: `${id}-usage-repeat`,
      phase: "workload",
      now: addMinutesIso(now, 16),
      kind: "usage",
      input: usageInput,
    },
    {
      id: `${id}-close`,
      phase: "workload",
      now: addMinutesIso(now, 120),
      kind: "append",
      input: [
        envelope(
          `${id}-close`,
          { type: "task.closed", payload: { taskId: id, outcome: "done" } },
          addMinutesIso(now, 120),
        ),
      ],
    },
  ];
};

/** Fixed synthetic days; no real clock or random generator can alter an input. */
export const storageCostFixture = ({
  seed,
  days,
  history,
}: CostOptions): readonly CostOperation[] => {
  const historyStart = addMinutesIso(COST_START, -(history + 1) * 1440);
  const historyTimes = Array.from({ length: history }, (_, i) =>
    addMinutesIso(historyStart, i * 1440),
  );
  const seedNow = addMinutesIso(COST_START, -1);
  const correctionNow = addMinutesIso(COST_START, (days - 1) * 1440 + 180);
  return [
    {
      id: `${seed}-history-events`,
      phase: "seed",
      now: seedNow,
      kind: "append",
      input: [
        envelope(
          `${seed}-settings`,
          { type: "settings.updated", payload: { timezone: "UTC", digestWindows: [] } },
          historyStart,
        ),
        ...historyTimes.map((time, index) => task(`${seed}-history-${String(index)}`, time)),
      ],
    },
    {
      id: `${seed}-history-calendar`,
      phase: "seed",
      now: seedNow,
      kind: "calendar",
      input: {
        deviceId: "cost-phone",
        from: historyStart,
        to: COST_START,
        ruledSeries: [],
        events: historyTimes.map((time, index) =>
          calendar(`${seed}-history-${String(index)}`, time),
        ),
      },
    },
    {
      id: `${seed}-history-usage`,
      phase: "seed",
      now: seedNow,
      kind: "usage",
      input: {
        deviceId: "cost-phone",
        deviceName: "Fixture phone",
        isPhone: false,
        sessions: historyTimes.flatMap((time) => usage(time).sessions),
        uses: historyTimes.flatMap((time) => usage(time).uses ?? []),
      },
    },
    ...Array.from({ length: days }, (_, day) => dailyOperations(seed, day)).flat(),
    {
      id: `${seed}-correction`,
      phase: "workload",
      now: correctionNow,
      kind: "append",
      input: [
        envelope(
          `${seed}-amendment`,
          {
            type: "event.amended",
            payload: {
              targetId: `auto:cost:${seed}-day-0`,
              patch: { title: "Corrected first day" },
            },
          },
          correctionNow,
        ),
      ],
    },
  ];
};
