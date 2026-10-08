import { describe, expect, it } from "vitest";

import { en } from "./en.ts";
import {
  formatDuration,
  formatEyebrow,
  formatRelativeDay,
  formatSpan,
  formatWeekRange,
  LANGUAGES,
  type MessageKey,
  plural,
  t,
} from "./i18n.ts";
import { ru } from "./ru.ts";

const placeholders = (text: string): readonly string[] =>
  text
    .matchAll(/\{(\w+)\}/g)
    .map((match) => match[1] ?? "")
    .toArray();

const byName = (a: string, b: string): number => a.localeCompare(b);

describe("catalogs", () => {
  it("have the same keys in en and ru", () => {
    expect(Object.keys(ru).toSorted(byName)).toEqual(Object.keys(en).toSorted(byName));
  });

  it("keep every placeholder of en in ru", () => {
    const missing = Object.entries(en).flatMap(([key, text]) =>
      placeholders(text)
        .filter((name) => !placeholders(ru[key as MessageKey]).includes(name))
        .map((name) => `${key}:{${name}}`),
    );
    expect(missing).toEqual([]);
  });

  it("have no empty messages", () => {
    const empty = [...Object.entries(en), ...Object.entries(ru)].filter(
      ([, text]) => text.trim() === "",
    );
    expect(empty).toEqual([]);
  });

  it("seed the M0/M1 shells", () => {
    const expected: readonly MessageKey[] = [
      "app.name",
      "nav.now",
      "nav.day",
      "nav.add",
      "nav.projects",
      "nav.insights",
      "login.title",
      "login.subtitle",
      "login.telegram",
      "login.openBot",
      "login.waiting",
      "login.webFallback",
      "login.notAllowed",
      "settings.theme",
      "settings.theme.system",
      "settings.theme.light",
      "settings.theme.dark",
      "settings.language",
      "settings.timezone",
      "settings.digestWindows",
      "settings.quietHours",
      "settings.connectedApps",
      "settings.logout",
      "common.save",
      "common.cancel",
      "common.undo",
      "common.done",
      "common.delete",
      "common.back",
      "common.accept",
      "common.skip",
      "common.retry",
      "errors.offline",
      "errors.llmUnavailable",
      "errors.notFound",
    ];
    expect(expected.filter((key) => !Object.hasOwn(en, key))).toEqual([]);
    expect(LANGUAGES).toEqual(["en", "ru"]);
  });
});

describe("t", () => {
  it("returns the message for the language", () => {
    expect(t("en", "nav.now")).toBe("Now");
    expect(t("ru", "nav.now")).toBe("Сейчас");
  });

  it("interpolates {name} parameters", () => {
    expect(t("en", "login.openBot", { bot: "@PaceTaskTrackerBot" })).toBe(
      "Open @PaceTaskTrackerBot in Telegram",
    );
    expect(t("ru", "login.openBot", { bot: "@PaceTaskTrackerBot" })).toContain(
      "@PaceTaskTrackerBot",
    );
  });

  it("leaves unknown placeholders visible", () => {
    expect(t("en", "login.openBot")).toBe("Open {bot} in Telegram");
  });
});

describe("plural", () => {
  it("picks English one/other", () => {
    const forms = { one: "{count} task", other: "{count} tasks" };
    expect(plural("en", 1, forms)).toBe("1 task");
    expect(plural("en", 0, forms)).toBe("0 tasks");
    expect(plural("en", 5, forms)).toBe("5 tasks");
  });

  it("picks Russian one/few/many", () => {
    const forms = {
      few: "{count} задачи",
      many: "{count} задач",
      one: "{count} задача",
      other: "{count} задачи",
    };
    expect(plural("ru", 1, forms)).toBe("1 задача");
    expect(plural("ru", 2, forms)).toBe("2 задачи");
    expect(plural("ru", 5, forms)).toBe("5 задач");
    expect(plural("ru", 21, forms)).toBe("21 задача");
    expect(plural("ru", 11, forms)).toBe("11 задач");
    expect(plural("ru", 1.5, forms)).toBe("1.5 задачи");
  });

  it("falls back to other when a form is missing", () => {
    expect(plural("ru", 3, { one: "{count} день", other: "{count} дней" })).toBe("3 дней");
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(90, "en")).toBe("1h 30m");
    expect(formatDuration(90, "ru")).toBe("1 ч 30 м");
  });

  it("omits empty parts", () => {
    expect(formatDuration(60, "en")).toBe("1h");
    expect(formatDuration(45, "en")).toBe("45m");
    expect(formatDuration(0, "en")).toBe("0m");
    expect(formatDuration(0, "ru")).toBe("0 м");
    expect(formatDuration(120, "ru")).toBe("2 ч");
  });

  it("rounds fractional minutes", () => {
    expect(formatDuration(89.6, "en")).toBe("1h 30m");
  });
});

describe("formatSpan", () => {
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it("keeps the two largest meaningful units, rounding down", () => {
    expect(formatSpan(34.9, "en")).toBe("34m");
    expect(formatSpan(12 * HOUR + 34.9, "en")).toBe("12h 34m");
    expect(formatSpan(6 * DAY + 12 * HOUR + 59, "en")).toBe("6d 12h");
    expect(formatSpan(12 * DAY + 23 * HOUR, "en")).toBe("12d");
    expect(formatSpan(45 * DAY + 5 * HOUR, "en")).toBe("1mo 15d");
  });

  it("drops a zero second unit", () => {
    expect(formatSpan(2 * HOUR, "en")).toBe("2h");
    expect(formatSpan(3 * DAY + 20, "en")).toBe("3d");
    expect(formatSpan(60 * DAY, "en")).toBe("2mo");
    expect(formatSpan(0, "en")).toBe("0m");
  });

  it("uses the absolute value and the language's units", () => {
    expect(formatSpan(-(DAY + 3 * HOUR), "en")).toBe("1d 3h");
    expect(formatSpan(6 * DAY + 12 * HOUR, "ru")).toBe("6 д 12 ч");
    expect(formatSpan(40 * DAY, "ru")).toBe("1 мес 10 д");
    expect(formatSpan(5, "ru")).toBe("5 м");
  });
});

describe("formatRelativeDay", () => {
  const now = "2026-10-06T12:00:00.000Z"; // Tuesday 15:00 in Moscow
  const MOSCOW = "Europe/Moscow";

  it("names today, tomorrow and yesterday by the zone's calendar", () => {
    expect(formatRelativeDay("2026-10-06T20:59:00.000Z", now, { language: "en", tz: MOSCOW })).toBe(
      "today",
    );
    // 21:30 UTC is already Wednesday 00:30 in Moscow.
    expect(formatRelativeDay("2026-10-06T21:30:00.000Z", now, { language: "en", tz: MOSCOW })).toBe(
      "tomorrow",
    );
    expect(formatRelativeDay("2026-10-05T10:00:00.000Z", now, { language: "en", tz: MOSCOW })).toBe(
      "yesterday",
    );
    expect(formatRelativeDay("2026-10-06T20:59:00.000Z", now, { language: "ru", tz: MOSCOW })).toBe(
      "сегодня",
    );
    expect(formatRelativeDay("2026-10-07T10:00:00.000Z", now, { language: "ru", tz: MOSCOW })).toBe(
      "завтра",
    );
    expect(formatRelativeDay("2026-10-05T10:00:00.000Z", now, { language: "ru", tz: MOSCOW })).toBe(
      "вчера",
    );
  });

  it("names the exact date with its weekday otherwise, never a bare weekday", () => {
    const en = (at: string) => formatRelativeDay(at, now, { language: "en", tz: MOSCOW });
    expect(en("2026-10-08T10:00:00.000Z")).toBe("Thu Oct 8");
    expect(en("2026-10-13T10:00:00.000Z")).toBe("Tue Oct 13");
    expect(en("2026-10-01T10:00:00.000Z")).toBe("Thu Oct 1");
    expect(en("2027-01-05T10:00:00.000Z")).toBe("Tue Jan 5 2027");
    expect(formatRelativeDay("2026-10-13T10:00:00.000Z", now, { language: "ru", tz: MOSCOW })).toBe(
      "вт 13 окт.",
    );
  });
});

describe("page header dates", () => {
  it("spells the weekday out in the eyebrow, on the zone's calendar", () => {
    expect(formatEyebrow("2026-10-08T12:00:00.000Z", "Europe/Moscow", "en")).toBe(
      "Thursday · Oct 8",
    );
    expect(formatEyebrow("2026-10-07T22:30:00.000Z", "Europe/Moscow", "en")).toBe(
      "Thursday · Oct 8",
    );
    expect(formatEyebrow("2026-10-08T12:00:00.000Z", "Europe/Moscow", "ru")).toBe(
      "четверг · 8 окт.",
    );
  });

  it("names a week by its dates", () => {
    expect(formatWeekRange("2026-10-04T21:00:00.000Z", "Europe/Moscow", "en")).toBe("Oct 5 – 11");
    expect(formatWeekRange("2026-09-27T21:00:00.000Z", "Europe/Moscow", "en")).toBe(
      "Sep 28 – Oct 4",
    );
    expect(formatWeekRange("2026-10-04T21:00:00.000Z", "Europe/Moscow", "ru")).toBe("5 – 11 окт.");
  });
});
