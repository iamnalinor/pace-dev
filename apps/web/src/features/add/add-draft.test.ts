import { describe, expect, it } from "vitest";

import { MOSCOW } from "@pace/core/testing";

import { type AddDraft, draftToForm, EMPTY_DRAFT, splitProblems } from "./add-draft.ts";

const draft = (patch: Partial<AddDraft>): AddDraft => ({ ...EMPTY_DRAFT, ...patch });

describe("splitProblems", () => {
  it("splits on commas, keeps each label as typed and drops blanks", () => {
    expect(splitProblems("1, 3, 5а ,, 6 (Проскуряков)")).toEqual([
      "1",
      "3",
      "5а",
      "6 (Проскуряков)",
    ]);
    expect(splitProblems("  ")).toEqual([]);
  });
});

describe("draftToForm", () => {
  it("refuses a draft without a title", () => {
    expect(draftToForm(draft({ text: "  " }), MOSCOW)).toEqual({
      error: "add.titleRequired",
      ok: false,
    });
  });

  it("always sends the due with the zone it was read in", () => {
    const result = draftToForm(draft({ due: "2026-10-09T18:00", text: "Report" }), MOSCOW);
    expect(result).toEqual({
      ok: true,
      value: {
        dueAt: "2026-10-09T15:00:00.000Z",
        dueTz: MOSCOW,
        fields: {},
        presetId: "personal",
        subtasks: [],
        title: "Report",
      },
    });
  });

  it("refuses a due that is not a real date-time", () => {
    expect(draftToForm(draft({ due: "2026-02-30T10:00", text: "x" }), MOSCOW)).toEqual({
      error: "add.dueInvalid",
      ok: false,
    });
  });

  it("carries only what was filled in, the title verbatim", () => {
    const result = draftToForm(
      draft({
        description: " Chapter 3 ",
        estimate: 90,
        importance: "asap",
        presetId: "work",
        problems: ["a", "b"],
        projectName: " Thesis ",
        submitVia: "",
        text: " Write the intro ",
        ticket: "TRK-9",
      }),
      MOSCOW,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        description: "Chapter 3",
        estimateMinutes: 90,
        fields: { ticket: "TRK-9" },
        importance: "asap",
        presetId: "work",
        projectName: "Thesis",
        subtasks: [{ label: "a" }, { label: "b" }],
        title: " Write the intro ",
      },
    });
  });
});
