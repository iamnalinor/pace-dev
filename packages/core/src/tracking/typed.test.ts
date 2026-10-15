import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { typedActivity, typedSpan } from "./typed.ts";

describe("a typed activity", () => {
  it("takes the length out of the words: it becomes the Expect", () => {
    expect(typedActivity("Пошел в ЦСС, 20мин")).toEqual({
      expectMinutes: 20,
      label: "Пошел в ЦСС",
    });
    expect(typedActivity("walk the dog 1.5h")).toEqual({
      expectMinutes: 90,
      label: "walk the dog",
    });
  });

  it("keeps the words as they are without a length", () => {
    expect(typedActivity("  Reading  ")).toEqual({ expectMinutes: null, label: "Reading" });
  });

  it("keeps the whole text when it is nothing but a length", () => {
    expect(typedActivity("20 min")).toEqual({ expectMinutes: 20, label: "20 min" });
  });
});

const MOSCOW = "Europe/Moscow";
/** 12:00 in Moscow on Wednesday October 14 2026. */
const NOON = "2026-10-14T09:00:00.000Z";
const msk = (date: string, time: string): string =>
  new Date(`${date}T${time}:00+03:00`).toISOString();

const span = (text: string, now = NOON, zone = MOSCOW) => typedSpan(text, { now, zone });

describe("a typed time span", () => {
  it("reads a span of clock times in every way it is typed, the rest is the label", () => {
    const block = { endAt: msk("2026-10-14", "08:30"), startAt: msk("2026-10-14", "07:30") };
    expect(span("7:30 - 8:30 - ходил в военкомат.")).toEqual({
      ...block,
      label: "ходил в военкомат",
    });
    expect(span("с 7:30 до 8:30 ходил в военкомат")).toEqual({
      ...block,
      label: "ходил в военкомат",
    });
    expect(span("7:30-8:30 ходил в военкомат")).toEqual({ ...block, label: "ходил в военкомат" });
    expect(span("07.30–08.30 военкомат")).toEqual({ ...block, label: "военкомат" });
    expect(span("from 7:30 to 8:30 dentist")).toEqual({ ...block, label: "dentist" });
    expect(span("с 7 до 8:30 военкомат")).toEqual({
      endAt: block.endAt,
      label: "военкомат",
      startAt: msk("2026-10-14", "07:00"),
    });
    expect(span("военкомат 7:30-8:30")).toEqual({ ...block, label: "военкомат" });
  });

  it("reads a length typed first as the time that just passed", () => {
    expect(span("20 мин читал")).toEqual({
      endAt: NOON,
      label: "читал",
      startAt: msk("2026-10-14", "11:40"),
    });
    expect(span("1.5h deep work")).toEqual({
      endAt: NOON,
      label: "deep work",
      startAt: msk("2026-10-14", "10:30"),
    });
  });

  it("is no span without one, or with nothing but one", () => {
    expect(span("Пошел в ЦСС, 20мин")).toBeNull();
    expect(span("купить кабель")).toBeNull();
    expect(span("7:30 - 8:30")).toBeNull();
    expect(span("20 мин")).toBeNull();
    expect(span("в 7:30 встреча")).toBeNull();
    expect(span("7:30-24:10 нет такого времени")).toBeNull();
    expect(span("7:30-8:61 нет такого времени")).toBeNull();
  });

  it("puts a span around now on today, and one that would start ahead on yesterday", () => {
    // Ends now, ends a minute ahead, starts exactly now: all today.
    expect(span("11:00-12:00 x")?.startAt).toBe(msk("2026-10-14", "11:00"));
    expect(span("11:00-12:01 x")?.endAt).toBe(msk("2026-10-14", "12:01"));
    expect(span("12:00-13:00 x")?.startAt).toBe(msk("2026-10-14", "12:00"));
    // Starts a minute ahead: yesterday's block.
    expect(span("12:01-13:00 x")).toMatchObject({
      endAt: msk("2026-10-13", "13:00"),
      startAt: msk("2026-10-13", "12:01"),
    });
  });

  it("crosses midnight: the end goes to the next day", () => {
    // At 02:00, "23:00-01:00" is the night just gone.
    expect(span("23:00-01:00 сон", msk("2026-10-14", "02:00"))).toMatchObject({
      endAt: msk("2026-10-14", "01:00"),
      startAt: msk("2026-10-13", "23:00"),
    });
    // At 23:30 it is on now.
    expect(span("23:00 - 00:30 кино", msk("2026-10-14", "23:30"))).toMatchObject({
      endAt: msk("2026-10-15", "00:30"),
      startAt: msk("2026-10-14", "23:00"),
    });
  });

  it("reads the clock in the account's zone, across a change of offset", () => {
    expect(span("7:30-8:30 x", "2026-10-14T09:00:00.000Z", "UTC")?.startAt).toBe(
      "2026-10-14T07:30:00.000Z",
    );
    // Berlin leaves summer time at 03:00 on October 25 2026: 01:00–04:00 is four hours.
    const after = "2026-10-25T05:00:00.000Z";
    const night = span("1:00-4:00 x", after, "Europe/Berlin");
    expect(night).toMatchObject({
      endAt: "2026-10-25T03:00:00.000Z",
      startAt: "2026-10-24T23:00:00.000Z",
    });
  });

  it("never starts ahead of now, never ends before it starts, never spans a day (property)", () => {
    const clock = fc
      .tuple(fc.integer({ max: 23, min: 0 }), fc.integer({ max: 59, min: 0 }))
      .map(([hours, minutes]) => `${String(hours)}:${String(minutes).padStart(2, "0")}`);
    const instant = fc
      .integer({ max: Date.parse("2027-12-31T00:00:00Z"), min: Date.parse("2026-01-01T00:00:00Z") })
      .map((ms) => new Date(ms).toISOString());
    const typed = fc.record({
      from: clock,
      now: instant,
      to: clock,
      zone: fc.constantFrom("UTC", MOSCOW, "America/New_York", "Asia/Kolkata"),
    });
    fc.assert(
      fc.property(typed, ({ from, now, to, zone }) => {
        const read = typedSpan(`${from}-${to} x`, { now, zone });
        const length = read === null ? 0 : Date.parse(read.endAt) - Date.parse(read.startAt);
        expect(read === null ? from === to : read.startAt <= now).toBe(true);
        expect(read === null || (length > 0 && length <= 25 * 60 * 60 * 1000)).toBe(true);
      }),
    );
  });
});
