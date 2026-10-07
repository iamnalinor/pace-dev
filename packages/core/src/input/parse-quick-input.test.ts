import { describe, expect, it } from "vitest";

import { ALGEBRA_ID, artboardState, ctx, MOSCOW, WORK_ID } from "../queries/fixture.fake.ts";
import { parseQuickInput } from "./parse-quick-input.ts";

// NOW is Tuesday 2026-10-06 15:00 in Moscow.
const state = artboardState();
const parse = (text: string) => parseQuickInput(text, state, ctx());

describe("parseQuickInput", () => {
  it("reads homework with problems and a weekday deadline (RU)", () => {
    const result = parse("дз 7 по алгебре 1, 3, 5а до среды 23:59");
    expect(result).toMatchObject({
      title: "дз 7 по алгебре",
      presetId: "hw.algebra",
      projectId: ALGEBRA_ID,
      importance: "normal",
      isImportanceExplicit: false,
      dueAt: "2026-10-07T20:59:00.000Z",
      dueTz: MOSCOW,
      subtasks: [
        { label: "1", number: 1 },
        { label: "3", number: 3 },
        { label: "5а", number: null },
      ],
    });
  });

  it("reads a work sync with a time, an estimate and a link", () => {
    const result = parse("синк по дашборду завтра 15:00 1ч https://meet.example.com/abc");
    expect(result).toMatchObject({
      title: "синк по дашборду",
      presetId: "work",
      projectId: WORK_ID,
      dueAt: "2026-10-07T12:00:00.000Z",
      estimateMinutes: 60,
      link: "https://meet.example.com/abc",
      subtasks: [],
    });
    expect(result.spans.map((span) => span.kind)).toEqual(["due", "time", "estimate", "link"]);
  });

  it("makes an urgent call ASAP and keeps the rest of the words", () => {
    expect(parse("срочно позвонить маме")).toMatchObject({
      title: "позвонить маме",
      presetId: "personal",
      importance: "asap",
      isImportanceExplicit: true,
      dueAt: null,
    });
  });

  it("leaves plain text alone with the category defaults", () => {
    const result = parse("buy a USB-C cable");
    expect(result).toMatchObject({
      title: "buy a USB-C cable",
      presetId: "personal",
      projectId: null,
      importance: "normal",
      dueAt: null,
      estimateMinutes: null,
      link: null,
      subtasks: [],
      spans: [],
    });
  });

  it("reads English times and estimates", () => {
    expect(parse("review the RFC tomorrow at 6pm 30m")).toMatchObject({
      title: "review the RFC",
      dueAt: "2026-10-07T15:00:00.000Z",
      estimateMinutes: 30,
    });
    expect(parse("call the bank 1.5h").estimateMinutes).toBe(90);
    expect(parse("прочитать статью полчаса").estimateMinutes).toBe(30);
  });

  it("does not read metres as minutes", () => {
    expect(parse("купить 2 м ткани")).toMatchObject({
      estimateMinutes: null,
      title: "купить 2 м ткани",
    });
    expect(parse("созвон 30 мин").estimateMinutes).toBe(30);
  });

  it("puts a bare time that has passed on tomorrow", () => {
    expect(parse("call at 9:00").dueAt).toBe("2026-10-07T06:00:00.000Z");
    expect(parse("call at 18:00").dueAt).toBe("2026-10-06T15:00:00.000Z");
  });

  it("takes a #project tag: an existing project by name, a new one by its text", () => {
    expect(parse("draft notes #Work")).toMatchObject({ projectId: WORK_ID, title: "draft notes" });
    expect(parse("plan the trip #Japan")).toMatchObject({
      projectId: null,
      projectName: "Japan",
      title: "plan the trip",
    });
  });

  it("uses the category's own importance when the text names none", () => {
    expect(parse("history essay").importance).toBe("nice_to_have");
    expect(parse("history essay важно").importance).toBe("prioritized");
  });

  it("does not read numbers as problems outside homework", () => {
    expect(parse("buy 2, 3 apples")).toMatchObject({ subtasks: [], title: "buy 2, 3 apples" });
  });

  it("keeps the source text verbatim", () => {
    const text = "  Синк  по дашборду завтра ";
    expect(parse(text).text).toBe(text);
  });
});
