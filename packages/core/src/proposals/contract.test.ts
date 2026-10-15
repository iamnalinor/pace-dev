import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Event, parseEvent } from "../events/event-schema.ts";
import { ACTIVITY_CATEGORIES } from "../events/payloads.ts";
import { at, HW_ID } from "../materialize/task-fixture.fake.ts";
import { blankModelAction, type ModelAction } from "../parse/schema.ts";
import { artboardState, ctx, MOSCOW, NOW } from "../queries/fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import { proposalContext } from "./context.ts";
import { proposalsFromModel } from "./from-model.ts";
import { PROPOSAL_KINDS } from "./kinds.ts";
import { planProposal } from "./plan.ts";
import { proposalsByRules } from "./rules.ts";
import { type ProposalBody, ProposalBodySchema, ProposalSchema } from "./schema.ts";
import { withSummary } from "./summary.ts";

/** A long run of one activity, so the learned length is far beyond a day. */
const marathon: readonly Event[] = [0, 1, 2].map((index) =>
  at(950 + index, addMinutesIso(NOW, -(index + 1) * 5000), {
    payload: {
      activityId: `long-${String(index)}`,
      category: "other",
      endAt: addMinutesIso(NOW, -(index + 1) * 5000 + 3000),
      label: "x",
      startAt: addMinutesIso(NOW, -(index + 1) * 5000),
    },
    type: "activity.logged",
  }),
);
const state = artboardState(NOW, marathon);
const context = proposalContext(state, ctx());
const summaryWorld = { language: "ru", now: NOW, state, zone: MOSCOW } as const;

/** Texts as people type them: long, blank, with lengths, spans, tags and numbers. */
const text = fc
  .array(
    fc.oneof(
      fc.string({ maxLength: 120 }),
      fc.constantFrom(
        "7:30 - 8:30 - ",
        "с 7 до 8 ",
        "20 мин ",
        "999 ч ",
        "#проект ",
        "срочно ",
        "1, 2, 3, ",
        "https://example.com/a ",
        ", ",
        "— ",
      ),
      fc.string({ maxLength: 400, minLength: 300 }),
    ),
    { maxLength: 12, minLength: 1 },
  )
  .map((parts) => parts.join(" ").slice(0, 4000))
  .filter((value) => value.trim() !== "");

const domains = fc.constantFrom<"activity" | "task">("task", "activity");

/** A string the model may put where a name goes: absent, blank, or anything up to 80. */
const loose = fc.oneof(fc.constant(null), fc.string({ maxLength: 80 }));
const anyLabel = fc.string({ maxLength: 200, minLength: 1 });
const rename = fc.record({ label: anyLabel, subtask: fc.constantFrom("5", "Block matrices") });
const subtask = fc.record({ label: anyLabel, number: fc.constant(null) });

/** Any action within the model's schema, naming lists' aliases and ones that are not there. */
const action: fc.Arbitrary<ModelAction> = fc
  .record({
    activity: fc.constantFrom(null, "a1", "a2", "a99"),
    category: fc.constantFrom(null, "work", "sport", "nope", ...ACTIVITY_CATEGORIES),
    kind: fc.constantFrom(...PROPOSAL_KINDS),
    label: loose,
    project: loose,
    quote: fc.constantFrom(null, "Algebra HW 6", "x"),
    renames: fc.array(rename, { maxLength: 3 }),
    subtaskRefs: fc.array(fc.constantFrom("5", "6", "99"), { maxLength: 3 }),
    subtasks: fc.array(subtask, { maxLength: 3 }),
    task: fc.constantFrom(null, "t1", "t2", "t99"),
    title: fc.oneof(fc.constant(null), fc.string({ maxLength: 300 })),
  })
  .map((fields) => blankModelAction(fields));

const minute = fc.integer({ max: 2 * 24 * 60, min: -3 * 24 * 60 });
const instant = minute.map((offset) => addMinutesIso(NOW, offset));
const expectMinutes = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer({ max: 1440, min: 1 }),
);

/** Any start or past block a proposal may name. */
const activityBody = fc.oneof(
  fc.record({
    category: fc.constantFrom(...ACTIVITY_CATEGORIES),
    expectMinutes,
    kind: fc.constant("activity.start" as const),
    label: fc.constantFrom("x", "Work", " padded "),
  }),
  fc.record({
    category: fc.constantFrom(...ACTIVITY_CATEGORIES),
    end: instant,
    kind: fc.constant("activity.log" as const),
    label: fc.constantFrom("x", "Military office"),
    start: instant,
  }),
);

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const isAnswerable = (body: ProposalBody): boolean => {
  const proposal = withSummary(body, ["title"], summaryWorld);
  const read = ProposalSchema.safeParse(proposal);
  if (!read.success) {
    throw new Error(`${JSON.stringify(proposal)}\n${read.error.message}`);
  }
  return true;
};

/** Every event a planned proposal writes, as the store would read it. */
const plannedEvents = (proposal: ProposalBody) => {
  const planned = planProposal(state, ProposalBodySchema.parse(proposal), {
    deviceTz: MOSCOW,
    newId: () => ID,
    now: NOW,
    source: "bot",
  });
  const inputs = planned.ok ? planned.value : [];
  return inputs.map((input) => parseEvent({ ...input, deviceId: "d", id: ID, recordedAt: NOW }));
};

describe("what the server answers always fits its own contract", () => {
  it("the rules' proposals, with their summaries (property)", () => {
    fc.assert(
      fc.property(text, domains, (typed, domain) => {
        const proposals = proposalsByRules(typed, domain, { ctx: ctx(), state });
        expect(proposals.every((body) => isAnswerable(body))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("the model's proposals, whatever it answers within its schema (property)", () => {
    fc.assert(
      fc.property(text, fc.array(action, { maxLength: 4 }), domains, (typed, actions, domain) => {
        const { readings } = proposalsFromModel(
          { actions, confidence: 1, domain, questions: [] },
          { context, ctx: ctx(), domain, state, text: typed },
        );
        expect(readings.every((reading) => isAnswerable(reading.body))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("a summary stays within its length however long the lists are", () => {
    const long = "очень длинная подзадача ".repeat(8);
    const body: ProposalBody = {
      kind: "task.addSubtasks",
      subtasks: Array.from({ length: 100 }, (_, index) => ({
        label: `${long}${String(index)}`,
        number: null,
      })),
      taskId: HW_ID,
    };
    const proposal = withSummary(body, [], summaryWorld);
    expect(ProposalSchema.safeParse(proposal).success).toBe(true);
    expect(proposal.summary).toMatch(/\+\d+|…/u);
  });
});

describe("planned activity events always fit the event schema", () => {
  it("whatever start or block a proposal names (property)", () => {
    fc.assert(
      fc.property(activityBody, (proposal) => {
        expect(plannedEvents(proposal).filter((event) => !event.ok)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });
});
