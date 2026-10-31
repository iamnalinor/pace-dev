import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Language } from "../i18n/language.ts";
import type { Weekday } from "../model/preset.ts";
import type { SeriesSchedule } from "./series.ts";

import { type Event, type EventInput, parseEvent } from "../events/event-schema.ts";
import { instanceId, newId } from "../ids.ts";
import { coreReducer, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materialize } from "../materialize/materializer.ts";
import { taskFixture } from "../materialize/task-fixture.fake.ts";
import { taskById } from "../model/task.ts";
import {
  describeRepeatRule,
  type RepeatRule,
  repeatRuleOf,
  taskRepeatRule,
} from "./repeat-rule.ts";
import { seriesInstanceId } from "./series-instances.ts";

const NOW = "2026-10-31T09:00:00.000Z";
const MOSCOW = "Europe/Moscow";

const say = (rule: RepeatRule, language: Language): string =>
  describeRepeatRule(rule, { language, now: NOW, tz: MOSCOW });

const both = (rule: RepeatRule): readonly [string, string] => [say(rule, "en"), say(rule, "ru")];

const every = (days: number) => both({ kind: "every_n_days", days, until: null });
const weekly = (weekday: Weekday) => both({ kind: "weekly", weekday, until: null });
const monthly = (day: number) => both({ kind: "monthly", day, until: null });

describe("describeRepeatRule", () => {
  it("names every day and the weekdays", () => {
    expect(both({ kind: "daily", until: null })).toEqual(["Every day", "Каждый день"]);
    expect(both({ kind: "weekdays", until: null })).toEqual([
      "Every weekday (Mon–Fri)",
      "По будням (пн–пт)",
    ]);
  });

  it("counts the days of an every-N-days rule with the plural forms", () => {
    expect(every(1)).toEqual(["Every day", "Каждый день"]);
    expect(every(2)).toEqual(["Every 2 days", "Каждые 2 дня"]);
    expect(every(5)).toEqual(["Every 5 days", "Каждые 5 дней"]);
    expect(every(11)).toEqual(["Every 11 days", "Каждые 11 дней"]);
    expect(every(21)).toEqual(["Every 21 days", "Каждый 21 день"]);
    expect(every(22)).toEqual(["Every 22 days", "Каждые 22 дня"]);
  });

  it("names the weekday of a weekly rule, in the accusative in Russian", () => {
    expect(weekly(1)).toEqual(["Every Monday", "Каждый понедельник"]);
    expect(weekly(2)).toEqual(["Every Tuesday", "Каждый вторник"]);
    expect(weekly(3)).toEqual(["Every Wednesday", "Каждую среду"]);
    expect(weekly(4)).toEqual(["Every Thursday", "Каждый четверг"]);
    expect(weekly(5)).toEqual(["Every Friday", "Каждую пятницу"]);
    expect(weekly(6)).toEqual(["Every Saturday", "Каждую субботу"]);
    expect(weekly(7)).toEqual(["Every Sunday", "Каждое воскресенье"]);
  });

  it("names the day of a monthly rule with an English ordinal", () => {
    // Russian joins the day and «го» with a non-breaking hyphen: a narrow card never splits «10-го».
    expect(monthly(10)[1]).toBe("Каждый месяц, 10‑го числа");
    expect(monthly(1)).toEqual(["Every month on the 1st", "Каждый месяц, 1‑го числа"]);
    expect(monthly(2)).toEqual(["Every month on the 2nd", "Каждый месяц, 2‑го числа"]);
    expect(monthly(3)).toEqual(["Every month on the 3rd", "Каждый месяц, 3‑го числа"]);
    expect(monthly(4)).toEqual(["Every month on the 4th", "Каждый месяц, 4‑го числа"]);
    expect(monthly(11)).toEqual(["Every month on the 11th", "Каждый месяц, 11‑го числа"]);
    expect(monthly(12)).toEqual(["Every month on the 12th", "Каждый месяц, 12‑го числа"]);
    expect(monthly(13)).toEqual(["Every month on the 13th", "Каждый месяц, 13‑го числа"]);
    expect(monthly(21)).toEqual(["Every month on the 21st", "Каждый месяц, 21‑го числа"]);
    expect(monthly(22)).toEqual(["Every month on the 22nd", "Каждый месяц, 22‑го числа"]);
    expect(monthly(23)).toEqual(["Every month on the 23rd", "Каждый месяц, 23‑го числа"]);
  });

  it("says what a day that shorter months lack becomes", () => {
    expect(both({ kind: "monthly", day: 29, until: null })).toEqual([
      "Every month on the 29th (the last day in shorter months)",
      "Каждый месяц, 29‑го числа (в коротких месяцах — в последний день)",
    ]);
    expect(both({ kind: "monthly", day: 30, until: null })).toEqual([
      "Every month on the 30th (the last day in shorter months)",
      "Каждый месяц, 30‑го числа (в коротких месяцах — в последний день)",
    ]);
    // Every month is clamped to its own last day: the 31st is always the last one.
    expect(both({ kind: "monthly", day: 31, until: null })).toEqual([
      "Every month on the last day",
      "Каждый месяц, в последний день",
    ]);
  });

  it("adds the last repeat date, with the year only when it is another year", () => {
    expect(both({ kind: "daily", until: "2026-12-31" })).toEqual([
      "Every day, until Dec 31",
      "Каждый день, до 31 дек.",
    ]);
    expect(both({ kind: "weekly", weekday: 5, until: "2027-01-15" })).toEqual([
      "Every Friday, until Jan 15 2027",
      "Каждую пятницу, до 15 янв. 2027",
    ]);
  });

  it("gives a non-empty sentence for every rule in both languages", () => {
    const rules = fc.oneof(
      fc.constant<RepeatRule>({ kind: "daily", until: null }),
      fc.constant<RepeatRule>({ kind: "weekdays", until: null }),
      fc.integer({ max: 3650, min: 1 }).map(
        (days): RepeatRule => ({
          kind: "every_n_days",
          days,
          until: null,
        }),
      ),
      fc
        .integer({ max: 7, min: 1 })
        .map(
          (weekday): RepeatRule => ({ kind: "weekly", weekday: weekday as Weekday, until: null }),
        ),
      fc
        .integer({ max: 31, min: 1 })
        .map((day): RepeatRule => ({ kind: "monthly", day, until: null })),
    );
    fc.assert(
      fc.property(rules, fc.constantFrom<Language>("en", "ru"), (rule, language) => {
        const text = say(rule, language);
        expect(text).not.toMatch(/[{}]/u);
        expect(text).not.toMatch(/\.(?:one|few|many|other)$/u);
        expect(text.length).toBeGreaterThan(3);
      }),
    );
  });
});

describe("repeatRuleOf", () => {
  // Saturday Oct 31 2026, 23:59 in Moscow (20:59 UTC).
  const anchor = { at: "2026-10-31T20:59:00.000Z", tz: MOSCOW };

  it("reads the weekday and the day of the month in the anchor's zone", () => {
    expect(repeatRuleOf({ kind: "weekly" }, anchor)).toEqual({
      kind: "weekly",
      weekday: 6,
      until: null,
    });
    expect(repeatRuleOf({ kind: "monthly", until: "2027-03-31" }, anchor)).toEqual({
      kind: "monthly",
      day: 31,
      until: "2027-03-31",
    });
    // 21:30 UTC on Oct 31 is already Sunday Nov 1 in Moscow.
    const late = { at: "2026-10-31T21:30:00.000Z", tz: MOSCOW };
    expect(repeatRuleOf({ kind: "weekly" }, late)).toMatchObject({ weekday: 7 });
    expect(repeatRuleOf({ kind: "monthly" }, late)).toMatchObject({ day: 1 });
  });

  it("keeps the rules that need no anchor as they are", () => {
    const schedules: readonly SeriesSchedule[] = [
      { kind: "daily" },
      { kind: "weekdays", until: "2026-11-30" },
      { kind: "every_n_days", days: 3 },
    ];
    expect(schedules.map((schedule) => repeatRuleOf(schedule, anchor))).toEqual([
      { kind: "daily", until: null },
      { kind: "weekdays", until: "2026-11-30" },
      { kind: "every_n_days", days: 3, until: null },
    ]);
  });
});

const envelope = (input: EventInput): Event => {
  const parsed = parseEvent({ id: newId(), recordedAt: NOW, deviceId: "test", ...input });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

const SERIES_ID = "series-1";
const FIRST = seriesInstanceId(SERIES_ID, "0", 0);

const TEMPLATE = {
  taskId: FIRST,
  seriesId: SERIES_ID,
  seriesRevision: 0,
  title: "Rent",
  presetId: "personal",
  startAt: "2026-10-01T09:00:00.000Z",
  startTz: MOSCOW,
  dueAt: "2026-10-31T20:59:00.000Z",
  dueTz: MOSCOW,
  subtasks: [],
  fields: {},
};

const seriesLog = (schedule: SeriesSchedule): readonly Event[] => [
  envelope({
    type: "series.created",
    occurredAt: NOW,
    precision: "exact",
    source: "app",
    payload: { seriesId: SERIES_ID, schedule, template: TEMPLATE },
  }),
  envelope({
    type: "task.created",
    occurredAt: NOW,
    precision: "exact",
    source: "app",
    payload: TEMPLATE,
  }),
];

describe("taskRepeatRule", () => {
  it("reads a series instance's rule from its series, anchored on the template's due date", () => {
    const state = materialize(seriesLog({ kind: "monthly" }), coreReducer, INITIAL_CORE_STATE);
    const task = taskById(state.tasks, FIRST);
    expect(task).toBeDefined();
    expect(task === undefined ? null : taskRepeatRule(state, task)).toEqual({
      kind: "monthly",
      day: 31,
      until: null,
    });
  });

  it("follows a schedule edit and stops once the series is ended", () => {
    const log = seriesLog({ kind: "daily" });
    const edited = [
      ...log,
      envelope({
        type: "series.updated",
        occurredAt: NOW,
        precision: "exact",
        source: "app",
        payload: {
          seriesId: SERIES_ID,
          schedule: { kind: "weekly", until: "2026-12-31" },
          template: TEMPLATE,
        },
      }),
    ];
    const state = materialize(edited, coreReducer, INITIAL_CORE_STATE);
    const task = taskById(state.tasks, FIRST);
    expect(task === undefined ? null : taskRepeatRule(state, task)).toEqual({
      kind: "weekly",
      weekday: 6,
      until: "2026-12-31",
    });
    const ended = materialize(
      [
        ...edited,
        envelope({
          type: "series.archived",
          occurredAt: NOW,
          precision: "exact",
          source: "app",
          payload: { seriesId: SERIES_ID, keepTaskId: FIRST },
        }),
      ],
      coreReducer,
      INITIAL_CORE_STATE,
    );
    const kept = taskById(ended.tasks, FIRST);
    expect(kept === undefined ? "missing" : taskRepeatRule(ended, kept)).toBeNull();
  });

  it("is null for a one-off task and for a series the state does not know", () => {
    expect(taskRepeatRule(INITIAL_CORE_STATE, taskFixture({ id: "t1" }))).toBeNull();
    expect(
      taskRepeatRule(INITIAL_CORE_STATE, taskFixture({ id: "t1", seriesId: "gone" })),
    ).toBeNull();
  });

  it("reads a homework instance's week from its recurring preset, on the due weekday", () => {
    const presetId = "hw.algebra";
    const state = materialize(
      [
        envelope({
          type: "preset.created",
          occurredAt: NOW,
          precision: "exact",
          source: "app",
          payload: {
            id: presetId,
            name: "Algebra",
            extends: "hw",
            definition: {
              recurrence: {
                issued: { weekday: 1, time: "09:00" },
                due: { weekday: 4, time: "23:59" },
                tz: MOSCOW,
              },
            },
          },
        }),
      ],
      coreReducer,
      INITIAL_CORE_STATE,
    );
    const instance = taskFixture({ id: instanceId(presetId, "2026-W44"), presetId });
    expect(taskRepeatRule(state, instance)).toEqual({ kind: "weekly", weekday: 4, until: null });
    // A task of the same preset that is not one of its weekly instances does not repeat.
    expect(taskRepeatRule(state, taskFixture({ id: "t1", presetId }))).toBeNull();
  });
});
