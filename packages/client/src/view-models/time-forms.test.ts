import { describe, expect, it } from "vitest";

import { tapToast, type TimeButtonView } from "./time-bar.ts";
import { activityFormOf, buttonFormOf, buttonSaveOf, withCategory } from "./time-forms.ts";

const commute: TimeButtonView = {
  category: "commute",
  color: "blue",
  expectMinutes: 45,
  id: "btn:commute",
  isRunning: false,
  label: "Commute",
  limitMinutes: null,
  taskId: null,
  toast: { key: "time.started", params: { label: "Commute" } },
};

/** `HH:mm` of a UTC instant, standing in for a platform's time input. */
const clock = (iso: string): string => iso.slice(11, 16);

describe("time forms", () => {
  it("round-trips a button through the editor form", () => {
    const form = buttonFormOf({ button: commute, kind: "edit" });
    expect(form).toEqual({
      category: "commute",
      expect: "45",
      label: "Commute",
      limit: "",
      taskId: "",
    });
    expect(
      buttonSaveOf({ button: commute, kind: "edit" }, { ...form, expect: " 35 ", limit: "1.5" }),
    ).toEqual({
      buttonId: "btn:commute",
      draft: {
        category: "commute",
        expectMinutes: 35,
        label: "Commute",
        limitMinutes: null,
        taskId: null,
      },
    });
    expect(buttonSaveOf({ kind: "new" }, buttonFormOf({ kind: "new" })).buttonId).toBeNull();
  });

  it("brings a category's defaults and keeps typed values it has none for", () => {
    const form = { ...buttonFormOf({ kind: "new" }), expect: "20", limit: "40" };
    expect(withCategory(form, "hygiene")).toMatchObject({
      category: "hygiene",
      expect: "20",
      limit: "60",
    });
    expect(withCategory(form, "food")).toMatchObject({ expect: "30", limit: "40" });
  });

  it("words the tap: started, switched or stopped", () => {
    expect(tapToast(commute, undefined)).toEqual({
      key: "time.started",
      params: { label: "Commute" },
    });
    expect(tapToast(commute, "Work")).toEqual({
      key: "time.switched",
      params: { from: "Work", to: "Commute" },
    });
    expect(tapToast({ ...commute, isRunning: true }, "Commute")).toEqual({
      key: "time.stopped",
      params: { label: "Commute" },
    });
  });

  it("opens the Day sheet on the block's own fields", () => {
    expect(
      activityFormOf(
        {
          activityId: "a1",
          category: "food",
          endAt: null,
          kind: "edit",
          label: "Lunch",
          startAt: "2026-10-06T12:30:00.000Z",
        },
        clock,
      ),
    ).toEqual({ category: "food", from: "12:30", label: "Lunch", to: "" });
    expect(
      activityFormOf(
        { endAt: "2026-10-06T10:00:00.000Z", kind: "log", startAt: "2026-10-06T09:00:00.000Z" },
        clock,
      ),
    ).toEqual({ category: "other", from: "09:00", label: "", to: "10:00" });
  });
});
