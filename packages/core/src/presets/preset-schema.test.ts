import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parsePresetDefinition, PresetDefinitionSchema, PresetIdSchema } from "./preset-schema.ts";

const recurrence = {
  due: { time: "23:59", weekday: 3 },
  issued: { time: "10:00", weekday: 1 },
  tz: "Europe/Moscow",
};

describe("PresetDefinitionSchema", () => {
  it("accepts an empty definition (a child that changes nothing)", () => {
    expect(PresetDefinitionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full definition", () => {
    const full = {
      color: "blue",
      deadlinePolicy: {
        finalAt: "2026-12-20T20:59:59.000Z",
        finalTz: "Europe/Moscow",
        kind: "resubmission",
        softDays: 7,
      },
      defaultEstimateMinutes: 60,
      defaultImportance: "normal",
      fields: { description: true, startAt: false, submitVia: false, ticket: false },
      notify: {
        criticalHours: 12,
        criticalProgress: 0.5,
        criticalScore: 10,
        inProgressIdleDays: 5,
        waitingDays: 7,
      },
      progressMode: "subtasks",
      recurrence,
      submission: "per_subtask",
      urgencyPolicy: "resubmission",
    };
    expect(parsePresetDefinition(full)).toEqual({ ok: true, value: full });
  });

  it("is strict: an unknown key fails", () => {
    expect(PresetDefinitionSchema.safeParse({ display: "card" }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ fields: { tags: true } }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ notify: { digest: 1 } }).success).toBe(false);
    expect(
      PresetDefinitionSchema.safeParse({ recurrence: { ...recurrence, weekday: 1 } }).success,
    ).toBe(false);
  });

  it("rejects an explicit undefined (exact optional keys)", () => {
    expect(PresetDefinitionSchema.safeParse({ urgencyPolicy: undefined }).success).toBe(false);
  });

  it("accepts null recurrence (removes an inherited schedule)", () => {
    expect(parsePresetDefinition({ recurrence: null })).toEqual({
      ok: true,
      value: { recurrence: null },
    });
  });

  it("rejects unknown enum members", () => {
    expect(PresetDefinitionSchema.safeParse({ urgencyPolicy: "panic" }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ defaultImportance: "urgent" }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ submission: "partial" }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ progressMode: "percent" }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ color: "red" }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ deadlinePolicy: { kind: "soft" } }).success).toBe(
      false,
    );
  });

  it("requires finalTz when finalAt is set on a resubmission policy", () => {
    const policy = { finalAt: "2026-12-20T20:59:59.000Z", kind: "resubmission", softDays: 7 };
    expect(
      PresetDefinitionSchema.safeParse({ deadlinePolicy: { ...policy, finalTz: null } }).success,
    ).toBe(false);
    expect(
      PresetDefinitionSchema.safeParse({ deadlinePolicy: { ...policy, finalTz: "Europe/Moscow" } })
        .success,
    ).toBe(true);
    expect(
      PresetDefinitionSchema.safeParse({
        deadlinePolicy: { finalAt: null, finalTz: null, kind: "resubmission", softDays: 0 },
      }).success,
    ).toBe(true);
  });

  it("validates the recurrence slots", () => {
    const isIssuedAccepted = (issued: unknown) =>
      PresetDefinitionSchema.safeParse({ recurrence: { ...recurrence, issued } }).success;
    expect(isIssuedAccepted({ time: "10:00", weekday: 0 })).toBe(false);
    expect(isIssuedAccepted({ time: "10:00", weekday: 8 })).toBe(false);
    expect(isIssuedAccepted({ time: "10:00", weekday: 1.5 })).toBe(false);
    expect(isIssuedAccepted({ time: "24:00", weekday: 1 })).toBe(false);
    expect(isIssuedAccepted({ time: "9:00", weekday: 1 })).toBe(false);
    expect(isIssuedAccepted({ time: "09:00", weekday: 7 })).toBe(true);
    expect(
      PresetDefinitionSchema.safeParse({ recurrence: { ...recurrence, tz: "Mars/Olympus" } })
        .success,
    ).toBe(false);
  });

  it("bounds the numbers", () => {
    expect(PresetDefinitionSchema.safeParse({ defaultEstimateMinutes: -1 }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ defaultEstimateMinutes: 1.5 }).success).toBe(false);
    expect(PresetDefinitionSchema.safeParse({ notify: { criticalProgress: 1.5 } }).success).toBe(
      false,
    );
    expect(PresetDefinitionSchema.safeParse({ notify: { criticalHours: -1 } }).success).toBe(false);
    expect(
      PresetDefinitionSchema.safeParse({ deadlinePolicy: { kind: "resubmission", softDays: -1 } })
        .success,
    ).toBe(false);
  });

  it("reports the failing path in the error", () => {
    expect(parsePresetDefinition({ notify: { criticalHours: "soon" } })).toEqual({
      error: expect.stringContaining("notify.criticalHours") as string,
      ok: false,
    });
  });
});

describe("PresetIdSchema", () => {
  it("accepts lowercase slugs with dot or dash separators", () => {
    for (const id of ["hw", "hw.algebra", "my-course", "a1.b2-c3", "x"]) {
      expect(PresetIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const id of ["", "HW", "hw..algebra", ".hw", "hw.", "hw algebra", "hw_1", "hw:1", "é"]) {
      expect(PresetIdSchema.safeParse(id).success).toBe(false);
    }
    expect(PresetIdSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(PresetIdSchema.safeParse("a".repeat(65)).success).toBe(false);
  });

  it("accepts every generated slug", () => {
    const segment = fc.stringMatching(/^[a-z0-9]{1,8}$/);
    const slug = fc
      .array(fc.tuple(fc.constantFrom(".", "-"), segment), { maxLength: 4 })
      .chain((rest) =>
        segment.map((head) => head + rest.map(([sep, part]) => sep + part).join("")),
      );
    fc.assert(
      fc.property(slug, (id) => {
        expect(PresetIdSchema.safeParse(id).success).toBe(true);
      }),
    );
  });
});
