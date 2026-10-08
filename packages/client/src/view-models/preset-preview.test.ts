import { describe, expect, it } from "vitest";

import { BASE_PRESETS, INITIAL_PRESETS_STATE } from "@pace/core";
import { ctx as contextAt, MOSCOW } from "@pace/core/testing";

import { editorDraft, newDraft } from "./preset-draft.ts";
import { presetPreview } from "./preset-preview.ts";

const presets = INITIAL_PRESETS_STATE;
const ctx = contextAt();

describe("presetPreview", () => {
  it("draws a homework sample: its color, a due tomorrow and the solved problems", () => {
    const preview = presetPreview(presets, newDraft("hw"), { ...ctx, zone: MOSCOW });
    expect(preview?.color).toBe("yellow");
    expect(preview?.progressMode).toBe("subtasks");
    expect(preview?.meta.map((part) => part.kind)).toEqual(["due", "solved"]);
  });

  it("shows importance and the pace for a slider preset", () => {
    const draft = {
      ...newDraft("work"),
      definition: { defaultImportance: "asap", progressMode: "slider" },
    } as const;
    const preview = presetPreview(presets, draft, { ...ctx, zone: MOSCOW });
    expect(preview?.meta.map((part) => part.kind)).toEqual(["importance", "due", "behind-pace"]);
  });

  it("previews a default preset's own edits, and nothing for a broken chain", () => {
    const draft = {
      ...editorDraft(BASE_PRESETS.personal),
      definition: { progressMode: "none" as const },
    };
    const preview = presetPreview(presets, draft, { ...ctx, zone: MOSCOW });
    expect(preview?.color).toBe("orange");
    expect(preview?.meta.map((part) => part.kind)).toEqual(["due"]);
    expect(presetPreview(presets, newDraft("gone"), { ...ctx, zone: MOSCOW })).toBeNull();
  });

  it("takes the due from the next instance of a weekly schedule", () => {
    const draft = {
      ...newDraft("hw"),
      definition: {
        recurrence: {
          due: { time: "23:59", weekday: 5 },
          issued: { time: "10:00", weekday: 1 },
          tz: MOSCOW,
        },
      },
    } as const;
    const due = presetPreview(presets, draft, { ...ctx, zone: MOSCOW })?.meta[0];
    expect(due?.kind === "due" && due.tz).toBe(MOSCOW);
    expect(due?.kind === "due" && Date.parse(due.at) > Date.parse(ctx.now)).toBe(true);
  });
});
