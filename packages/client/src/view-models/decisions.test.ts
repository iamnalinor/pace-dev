import { describe, expect, it } from "vitest";

import { AUTO_SLEEP_LABEL, type Decision, type Event, sleepStartId } from "@pace/core";
import { artboardState, at, BOOKS_ID } from "@pace/core/testing";

import { type DecisionView, decisionViews } from "./decisions.ts";

const DECIDED = "2026-10-06T10:00:00.000Z";
/** Late enough that every event of a test is in the state. */
const LATER = "2026-10-09T12:00:00.000Z";
const CABLE_ID = "t-cable";

const NO_STEP = {
  activityId: null,
  closeOutcome: null,
  fields: [],
  startAt: null,
  subject: null,
  taskId: null,
};

const parsed = (inputs: Record<string, unknown>, rest: Partial<Decision> = {}): Decision => ({
  at: DECIDED,
  explanation: "Parsed by gpt-5.6-luna; not found in the text: project, subtasks.",
  id: "d1",
  inputs,
  kind: "parse",
  outcome: "parsed",
  rule: "parse.task.create",
  taskId: null,
  ...rest,
});

const cable = parsed({
  actions: ["The assistant will create “Buy cable”"],
  channel: "api",
  doubtful: ["project", "subtasks"],
  provider: "gpt-5.6-luna#2",
  steps: [{ ...NO_STEP, kind: "task.create", subject: "Buy cable" }],
  text: "buy cable tomorrow #home",
});

const created = (occurredAt: string, sourceText: string): Event =>
  at(950, occurredAt, {
    payload: {
      fields: {},
      presetId: "personal",
      sourceText,
      subtasks: [],
      taskId: CABLE_ID,
      title: "Buy cable",
    },
    type: "task.created",
  });

const started = (occurredAt: string, label: string): Event =>
  at(951, occurredAt, {
    payload: { activityId: "a-gym", category: "sport", label },
    type: "activity.started",
  });

/** Soon after the readings: a card may still be open. */
const SOON = "2026-10-06T10:05:00.000Z";

const logIn = (
  language: "en" | "ru",
  log: readonly Decision[],
  { extra = [], now = SOON }: { readonly extra?: readonly Event[]; readonly now?: string } = {},
) => decisionViews(log, { language, now, state: artboardState(LATER, extra) });

const viewIn =
  (language: "en" | "ru") =>
  (decision: Decision, extra: readonly Event[] = []): DecisionView => {
    const [view] = logIn(language, [decision], { extra });
    if (view === undefined) {
      throw new Error("no view");
    }
    return view;
  };
const en = viewIn("en");
const ru = viewIn("ru");

/** A thread approved after `turns`, its last turn `text`. */
const thread = (turns: readonly string[], text: string): Decision => ({
  ...cable,
  inputs: { ...(cable.inputs as Record<string, unknown>), request: "#ask Taptwo", text, turns },
  resolution: "approved",
});

describe("decisionView", () => {
  it("says what became of the message, as recorded, quotes it, and names what the text lacked", () => {
    const approved: Decision = { ...cable, resolution: "approved", taskId: CABLE_ID };
    const state = [created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home")];
    expect(en(approved, state)).toEqual({
      at: DECIDED,
      followups: [],
      id: "d1",
      lines: ["Created task “Buy cable”"],
      note: null,
      notFound: "Not in your text: project, subtasks",
      outcome: "You approved it",
      request: "buy cable tomorrow #home",
      taskId: CABLE_ID,
      via: "via gpt-5.6-luna",
    });
    expect(ru(approved, state)).toEqual(
      expect.objectContaining({
        lines: ["Создана задача «Buy cable»"],
        notFound: "Не нашлось в вашем тексте: проект, подзадачи",
        outcome: "Вы подтвердили",
        request: "buy cable tomorrow #home",
        via: "через gpt-5.6-luna",
      }),
    );
  });

  it("says a reading was dismissed, kept in the Inbox, or corrected, when the log was told", () => {
    expect(en({ ...cable, resolution: "cancelled" })).toMatchObject({
      lines: ["Suggested a new task “Buy cable”"],
      outcome: "You dismissed it; nothing was done",
      taskId: null,
    });
    expect(ru({ ...cable, resolution: "cancelled" }).outcome).toBe(
      "Вы отменили — ничего не сделано",
    );
    expect(en({ ...cable, resolution: "inbox" }).outcome).toBe(
      "You kept the text in Inbox instead",
    );
    // A corrected reading is folded into its conversation's last row: it has none of its own.
    expect(logIn("en", [{ ...cable, resolution: "corrected" }])).toEqual([]);
    // A dismissed reading claims nothing, even when a task of that name exists.
    expect(
      en({ ...cable, resolution: "cancelled" }, [
        created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home"),
      ]),
    ).toMatchObject({ outcome: "You dismissed it; nothing was done", taskId: null });
    // An answer a newer server knows and this client does not reads as undecided.
    expect(en({ ...cable, resolution: "postponed" }).outcome).toBe("Shown to you for approval");
  });

  it("only says what it sees when nothing was recorded: a task of that name, not an approval", () => {
    expect(en(cable)).toMatchObject({
      lines: ["Suggested a new task “Buy cable”"],
      outcome: "Shown to you for approval",
      taskId: null,
    });
    expect(
      en(cable, [created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home")]),
    ).toMatchObject({
      lines: ["Suggested a new task “Buy cable”"],
      outcome: "A task “Buy cable” was created after this",
      taskId: CABLE_ID,
    });
    expect(
      ru(cable, [created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home")]).outcome,
    ).toBe("После этого появилась задача «Buy cable»");
    // Matched by title too (the request was corrected); a task a day later or before is another.
    expect(en(cable, [created("2026-10-06T10:01:00.000Z", "buy a cable")]).taskId).toBe(CABLE_ID);
    expect(
      en(cable, [created("2026-10-07T11:00:00.000Z", "buy cable tomorrow #home")]),
    ).toMatchObject({ outcome: "Shown to you for approval" });
    expect(
      en(cable, [created("2026-10-06T09:00:00.000Z", "buy cable tomorrow #home")]),
    ).toMatchObject({ outcome: "Shown to you for approval" });
  });

  it("words a close without its outcome (an older row) by its summary, never a dangling “as”", () => {
    const legacyClose = parsed(
      { actions: ["The assistant will close “Books” as Done"], text: "books done" },
      { rule: "parse.task.close" },
    );
    expect(en(legacyClose).lines).toEqual(["The assistant will close “Books” as Done"]);
  });

  it("keeps each summary beside its own step when a step is of a kind this client cannot read", () => {
    const mixed = parsed({
      actions: ["The assistant will teleport “Moon”", "The assistant will create “Buy cable”"],
      steps: [
        { ...NO_STEP, kind: "task.teleport", subject: "Moon" },
        { ...NO_STEP, kind: "task.create", subject: "Buy cable" },
      ],
      text: "x",
    });
    expect(en(mixed).lines).toEqual([
      "The assistant will teleport “Moon”",
      "Suggested a new task “Buy cable”",
    ]);
  });

  it("words every kind of action, with the task's current title", () => {
    const steps = [
      { ...NO_STEP, fields: ["dueDate"], kind: "task.update", taskId: BOOKS_ID },
      { ...NO_STEP, fields: ["title", "project"], kind: "task.update", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "task.delete", taskId: BOOKS_ID },
      { ...NO_STEP, closeOutcome: "done", kind: "task.close", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "task.addSubtasks", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "task.markSubtasks", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "activity.start", subject: "Gym" },
      { ...NO_STEP, kind: "activity.log", startAt: DECIDED, subject: "Walk" },
      { ...NO_STEP, activityId: "a-gone", fields: ["label"], kind: "activity.update" },
      { ...NO_STEP, activityId: "a-gone", kind: "activity.delete" },
    ];
    expect(en(parsed({ steps, text: "x" })).lines).toEqual([
      "Suggested moving the deadline of “Return library books”",
      "Suggested changing “Return library books”: title, project",
      "Suggested deleting task “Return library books”",
      "Suggested closing “Return library books” as Done",
      "Suggested subtasks for “Return library books”",
      "Suggested marking subtasks solved in “Return library books”",
      "Suggested starting “Gym”",
      "Suggested logging “Walk”",
      "Suggested changing “…”: name",
      "Suggested deleting “…” from your day",
    ]);
    // The task an edit was about can be opened.
    expect(en(parsed({ steps, text: "x" })).taskId).toBe(BOOKS_ID);
  });

  it("sees a close done after the reading, said as what it sees", () => {
    const close = parsed({
      steps: [{ ...NO_STEP, closeOutcome: "done", kind: "task.close", taskId: BOOKS_ID }],
      text: "books returned",
    });
    const closed = (outcome: "cancelled" | "done") =>
      at(952, "2026-10-06T10:01:00.000Z", {
        payload: { outcome, taskId: BOOKS_ID },
        type: "task.closed",
      });
    expect(en(close, [closed("done")])).toMatchObject({
      lines: ["Suggested closing “Return library books” as Done"],
      outcome: "“Return library books” was closed after this",
      taskId: BOOKS_ID,
    });
    expect(en({ ...close, resolution: "approved" }, [closed("done")]).lines).toEqual([
      "Closed “Return library books” as Done",
    ]);
    expect(en(close, [closed("cancelled")]).outcome).toBe("Shown to you for approval");
  });

  it("reads an older row from its rule, summaries and explanation", () => {
    const legacy = parsed(
      {
        actions: ["The assistant will start “Gym”"],
        channel: "api",
        doubtful: [],
        output: {},
        rejected: [],
        text: "gym",
      },
      {
        explanation: "Parsed by compatible; every field matched the text.",
        rule: "parse.activity.start",
      },
    );
    expect(en(legacy)).toMatchObject({
      lines: ["Suggested starting “Gym”"],
      notFound: null,
      request: "gym",
      via: null,
    });
    expect(en(legacy, [started("2026-10-06T10:00:30.000Z", "Gym")])).toMatchObject({
      lines: ["Suggested starting “Gym”"],
      outcome: "“Gym” was started after this",
    });
    expect(
      ru(
        parsed(
          {
            actions: ["Ассистент создаст «Купить кабель»", "Ассистент удалит «Старое»"],
            text: "к",
          },
          { explanation: "Parsed by groq-2; every field matched the text." },
        ),
      ),
    ).toMatchObject({
      lines: ["Предложена задача «Купить кабель»", "Ассистент удалит «Старое»"],
      via: null,
    });
    // A summary without a quoted name is shown as it was written.
    expect(en(parsed({ actions: ["Something new"], text: "x" })).lines).toEqual(["Something new"]);
  });

  it("matches a started activity by its label near the time it was asked for", () => {
    const since = parsed({
      steps: [
        { ...NO_STEP, kind: "activity.start", startAt: "2026-10-06T09:30:00.000Z", subject: "Gym" },
      ],
      text: "gym since 12:30",
    });
    expect(en(since, [started("2026-10-06T09:30:00.000Z", "Gym")]).outcome).toBe(
      "“Gym” was started after this",
    );
    expect(en(since, [started("2026-10-06T11:30:00.000Z", "Gym")]).outcome).toBe(
      "Shown to you for approval",
    );
    expect(en(since, [started("2026-10-06T09:30:00.000Z", "Run")]).outcome).toBe(
      "Shown to you for approval",
    );
  });

  it("says when the assistant could not answer, read it later, or kept it in the Inbox", () => {
    const unanswered = parsed(
      { channel: "api", retryAt: null, text: "call the bank" },
      {
        explanation: "No model could answer (rate limits); the text was not parsed.",
        outcome: "unavailable",
        rule: "parse.unavailable",
      },
    );
    expect(en(unanswered)).toMatchObject({
      lines: ["The assistant could not answer"],
      outcome: "Local rules suggested a reading instead",
      request: "call the bank",
      via: null,
    });
    expect(ru(unanswered).lines).toEqual(["Ассистент не смог ответить"]);
    // The rules' reading was approved: both are said.
    expect(en({ ...unanswered, resolution: "approved" }).outcome).toBe(
      "Local rules suggested a reading instead · You approved it",
    );
    const deferred = { outcome: "applied", rule: "parse.deferred" };
    expect(
      en(
        parsed(
          {
            steps: [{ ...NO_STEP, kind: "task.create", subject: "Buy cable", taskId: CABLE_ID }],
            text: "buy cable",
          },
          { ...deferred, taskId: CABLE_ID },
        ),
        [created("2026-10-06T10:00:00.000Z", "buy cable")],
      ),
    ).toMatchObject({
      lines: ["Created task “Buy cable”"],
      outcome: "Applied automatically once the assistant was back",
      taskId: CABLE_ID,
    });
    expect(en(parsed({ text: "buy cable" }, deferred))).toMatchObject({
      lines: ["Read later and applied"],
      taskId: null,
    });
    expect(
      en(parsed({ text: "buy cable" }, { outcome: "inbox", rule: "parse.deferred" })),
    ).toMatchObject({
      lines: ["Kept as a note in Inbox"],
      outcome: "The assistant could not read it later",
    });
    expect(en(parsed({ steps: [], text: "hm" })).lines).toEqual([
      "The assistant found nothing to do with this",
    ]);
  });

  it("words older notification rows, and keeps the explanation of anything newer", () => {
    const notification = parsed(
      {},
      {
        explanation: "A digest window.",
        kind: "notification",
        outcome: "suppressed",
        rule: "digest",
      },
    );
    expect(en(notification)).toMatchObject({
      lines: ["Notification held back"],
      note: "A digest window.",
      outcome: null,
      request: null,
    });
    expect(en({ ...notification, outcome: "sent" }).lines).toEqual(["Notification sent"]);
    expect(en({ ...notification, kind: "calendar", outcome: "moved" })).toMatchObject({
      lines: ["A digest window."],
      note: null,
    });
    expect(en(parsed({ text: "x" }, { outcome: "rethought" }))).toMatchObject({
      lines: ["Parsed by gpt-5.6-luna; not found in the text: project, subtasks."],
      request: "x",
    });
  });

  it("words a whole log with one index of the state, the same as row by row", () => {
    const state = artboardState(LATER, [
      created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home"),
    ]);
    const log = [cable, { ...cable, id: "d2", resolution: "cancelled" }];
    expect(
      decisionViews(log, { language: "en", now: SOON, state }).map((view) => view.outcome),
    ).toEqual(["A task “Buy cable” was created after this", "You dismissed it; nothing was done"]);
  });

  it("shows a conversation as one row: the request, the last answer, one outcome", () => {
    const first = { ...cable, id: "d1", resolution: "corrected" };
    const answered: Decision = {
      ...cable,
      id: "d2",
      inputs: {
        ...(cable.inputs as Record<string, unknown>),
        request: "buy cable tomorrow #home",
        text: "«By when does this need to be done?» — Tomorrow",
      },
      resolution: "approved",
      taskId: CABLE_ID,
    };
    const extra = [created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home")];
    expect(logIn("en", [answered, first], { extra })).toEqual([
      expect.objectContaining({
        followups: ["You answered “By when does this need to be done?”: Tomorrow"],
        id: "d2",
        lines: ["Created task “Buy cable”"],
        outcome: "You approved it",
        request: "buy cable tomorrow #home",
      }),
    ]);
    expect(logIn("ru", [answered])[0]?.followups).toEqual([
      "Вы ответили на «By when does this need to be done?»: Tomorrow",
    ]);
    const typed: Decision = {
      ...answered,
      inputs: { ...(answered.inputs as Record<string, unknown>), text: "urgent" },
    };
    expect(logIn("en", [typed])[0]?.followups).toEqual(["Then you wrote: “urgent”"]);
    // An older row holds only the answer's text: shown as an answer, with no request.
    const older: Decision = {
      ...cable,
      inputs: { ...(cable.inputs as Record<string, unknown>), text: "«When?» — Today" },
    };
    expect(en(older)).toMatchObject({ followups: ["You answered “When?”: Today"], request: null });
  });

  it("claims a task for one reading only when nothing was recorded", () => {
    const newer = { ...cable, at: "2026-10-06T10:00:10.000Z", id: "d2" };
    const extra = [created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home")];
    expect(logIn("en", [newer, cable], { extra }).map((view) => view.outcome)).toEqual([
      "A task “Buy cable” was created after this",
      "Shown to you for approval",
    ]);
  });

  it("says a rename as from what to what, the name as it was when read", () => {
    const rename = parsed(
      {
        actions: ["The assistant will change “Old books”: title"],
        steps: [
          {
            ...NO_STEP,
            fields: ["title"],
            kind: "task.update",
            renamedTo: "New",
            taskId: BOOKS_ID,
          },
        ],
        text: "rename",
      },
      { resolution: "approved" },
    );
    expect(en(rename).lines).toEqual(["Renamed “Old books” to “New”"]);
    expect(ru(rename).lines).toEqual(["Переименовано «Old books» в «New»"]);
    expect(en({ ...rename, resolution: null }).lines).toEqual([
      "Suggested renaming “Old books” to “New”",
    ]);
  });

  it("shows every turn of a conversation in order, tapped and typed", () => {
    expect(en(thread(["«When?» — Today"], "work")).followups).toEqual([
      "You answered “When?”: Today",
      "Then you wrote: “work”",
    ]);
    expect(en(thread(["work"], "«When?» — Tomorrow")).followups).toEqual([
      "Then you wrote: “work”",
      "You answered “When?”: Tomorrow",
    ]);
  });

  it("folds a thread nobody answered into its last reading, said neutrally once time passed", () => {
    const first = { ...cable, at: DECIDED, id: "d1" };
    const corrected: Decision = {
      ...cable,
      at: "2026-10-06T10:01:00.000Z",
      id: "d2",
      inputs: {
        ...(cable.inputs as Record<string, unknown>),
        request: "buy cable tomorrow #home",
        text: "urgent",
        turns: [],
      },
    };
    // The same request typed again an hour later is another conversation.
    const again = { ...cable, at: "2026-10-06T08:00:00.000Z", id: "d0" };
    expect(logIn("en", [corrected, first, again]).map((view) => view.id)).toEqual(["d2", "d0"]);
    expect(logIn("en", [corrected])[0]?.outcome).toBe("Shown to you for approval");
    const later = logIn("en", [corrected], { now: "2026-10-06T11:00:00.000Z" })[0];
    expect(later?.outcome).toBe("No answer — the card was closed or replaced");
    expect(logIn("ru", [corrected], { now: "2026-10-06T11:00:00.000Z" })[0]?.outcome).toBe(
      "Без ответа — карточку закрыли или заменили",
    );
  });

  it("names the model only when it was recorded", () => {
    const legacy = parsed(
      { text: "x" },
      { explanation: "Parsed by compatible; every field matched the text." },
    );
    expect(en(legacy).via).toBeNull();
    expect(en(parsed({ provider: "rules", text: "x" })).via).toBe("via local rules");
  });
});

/** A row automatic sleep wrote on the server about the instant `at`, decided in Moscow. */
const slept = (rule: string, at: string): Decision => ({
  at: "2026-10-08T04:15:00.000Z",
  explanation: `${rule} at ${at}`,
  id: `sleep-${at}`,
  inputs: {
    activityId: "auto:sleep-2026-10-07:start-20261007T2040",
    at,
    decidedUntil: null,
    eventId: "auto:sleep-2026-10-07:start-20261007T2040",
    knownUntil: "2026-10-08T04:10:00.000Z",
    spells: [{ endAt: "2026-10-07T20:40:00.000Z", startAt: "2026-10-07T20:10:00.000Z" }],
    zone: "Europe/Moscow",
  },
  kind: "sleep",
  outcome: "applied",
  rule,
  taskId: null,
});

/** One row of each decision automatic sleep makes, as worded in `language`. */
const sleepLines = (language: "en" | "ru") =>
  logIn(language, [
    slept("sleep.open", "2026-10-07T20:40:00.000Z"),
    slept("sleep.stop", "2026-10-08T04:10:00.000Z"),
    slept("sleep.reopen", "2026-10-08T00:00:00.000Z"),
    slept("sleep.discard", "2026-10-07T18:10:00.000Z"),
  ]).map((view) => view.lines);

describe("automatic sleep in the log", () => {
  it("words each decision with its time in the person's zone, never the rule's key", () => {
    expect(sleepLines("en")).toEqual([
      ["Sleep started at 23:40 (no phone or computer used since)"],
      ["Sleep ended at 07:10 (a phone or computer was used)"],
      ["Sleep continued: a short wake at 03:00"],
      ["A short rest at 21:10 was not sleep"],
    ]);
    expect(sleepLines("ru")).toEqual([
      ["Сон начался в 23:40 (с тех пор ни телефоном, ни компьютером не пользовались)"],
      ["Сон закончился в 07:10 (воспользовались телефоном или компьютером)"],
      ["Сон продолжился: короткое пробуждение в 03:00"],
      ["Короткий отдых в 21:10 не был сном"],
    ]);
    const shown = JSON.stringify(logIn("ru", [slept("sleep.open", "2026-10-07T20:40:00.000Z")]));
    expect(shown).not.toContain("sleep.open");
  });

  it("shows the server's own words for a sleep row it cannot read", () => {
    const newer = slept("sleep.merge", "2026-10-07T20:40:00.000Z");
    expect(logIn("en", [newer])[0]?.lines).toEqual(["sleep.merge at 2026-10-07T20:40:00.000Z"]);
    const broken = { ...slept("sleep.open", "x"), explanation: "Sleep opened" };
    expect(logIn("en", [broken])[0]?.lines).toEqual(["Sleep opened"]);
  });

  it("names automatic sleep in a reading about it in the reader's language", () => {
    const auto = sleepStartId("2026-10-05", "2026-10-06T07:00:00.000Z");
    const sleep: Event = {
      ...at(990, "2026-10-06T07:00:00.000Z", {
        payload: { activityId: auto, category: "sleep", label: AUTO_SLEEP_LABEL },
        type: "activity.started",
      }),
      id: auto,
      source: "system",
    };
    const offered = parsed(
      { steps: [{ ...NO_STEP, activityId: auto, kind: "activity.delete" }], text: "удали сон" },
      { rule: "parse.activity.delete" },
    );
    expect(ru(offered, [sleep]).lines).toEqual(["Предложено удалить «Сон» из дня"]);
  });
});
