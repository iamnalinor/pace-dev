import { describe, expect, it } from "vitest";

import { type TaskViewModel, taskViewModel } from "@pace/client";
import {
  artboardState,
  ctx,
  HW_ID,
  HW_VIEW_NOW,
  MOSCOW,
  TRK_ID,
  TRK_NOW,
} from "@pace/core/testing";

import { editChanges, type EditForm, initialEditForm } from "./edit-form.ts";

const view = (taskId: string, now: string): TaskViewModel => {
  const result = taskViewModel(artboardState(now), taskId, ctx(now));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

describe("initialEditForm", () => {
  it("opens with the task's values on its own zone's clock", () => {
    const form = initialEditForm(view(HW_ID, HW_VIEW_NOW), "UTC");
    expect(form).toMatchObject({
      description: "",
      due: "2026-10-07T23:59",
      estimate: 240,
      importance: "normal",
      presetId: "hw.algebra",
      title: "Algebra HW 6",
      zone: MOSCOW,
    });
  });

  it("falls back to the given zone and the preset's estimate", () => {
    const form = initialEditForm(view("t-books", HW_VIEW_NOW), MOSCOW);
    expect(form).toMatchObject({ due: "", estimate: null, zone: MOSCOW });
  });
});

describe("editChanges", () => {
  const hw = view(HW_ID, HW_VIEW_NOW);
  const initial = initialEditForm(hw, "UTC");
  const edit = (patch: Partial<EditForm>) => editChanges(hw, initial, { ...initial, ...patch });

  it("changes nothing when nothing was touched", () => {
    expect(edit({})).toEqual({ ok: true, value: { patch: {} } });
  });

  it("moves the due and keeps the zone it was read in", () => {
    expect(edit({ due: "2026-10-08T12:00" })).toEqual({
      ok: true,
      value: { patch: { dueAt: "2026-10-08T09:00:00.000Z", dueTz: MOSCOW } },
    });
    expect(edit({ zone: "UTC" })).toEqual({
      ok: true,
      value: {
        patch: { dueAt: "2026-10-07T23:59:00.000Z", dueTz: "UTC" },
      },
    });
  });

  it("carries the title, description, fields, preset, importance and estimate", () => {
    expect(
      edit({
        description: "",
        estimate: null,
        importance: "asap",
        presetId: "work",
        submitVia: "LMS",
        ticket: "ALG-6",
        title: "Algebra HW 6 (fixed)",
      }),
    ).toEqual({
      ok: true,
      value: {
        estimate: null,
        importance: "asap",
        patch: { fields: { submitVia: "LMS", ticket: "ALG-6" }, title: "Algebra HW 6 (fixed)" },
        presetId: "work",
      },
    });
    const trk = view(TRK_ID, TRK_NOW);
    const trkForm = initialEditForm(trk, "UTC");
    expect(editChanges(trk, trkForm, { ...trkForm, description: "" })).toEqual({
      ok: true,
      value: { patch: { description: null } },
    });
  });

  it("refuses a due without a real zone, an unreadable time and an empty title", () => {
    expect(edit({ zone: "Mars/Olympus" })).toEqual({ error: ["zoneInvalid"], ok: false });
    expect(edit({ due: "2026-02-30T10:00", start: "soon", title: " " })).toEqual({
      error: ["titleRequired", "dueInvalid", "startInvalid"],
      ok: false,
    });
    expect(edit({ due: "" })).toEqual({ error: ["dueRequired"], ok: false });
    const trk = view(TRK_ID, TRK_NOW);
    const trkForm = initialEditForm(trk, "UTC");
    expect(editChanges(trk, trkForm, { ...trkForm, start: "" })).toEqual({
      error: ["startRequired"],
      ok: false,
    });
    expect(editChanges(trk, trkForm, { ...trkForm, start: "2026-10-05T12:00" })).toEqual({
      ok: true,
      value: { patch: { startAt: "2026-10-05T12:00:00.000Z", startTz: "UTC" } },
    });
  });
});
