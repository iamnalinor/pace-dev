import type { ActionKind, ParseDomain } from "../../actions/kinds.ts";

import { BOOKS_ID, HW_VIEW_NOW, NOW, REPLY_ID } from "../../queries/fixture.fake.ts";

/**
One message of the LLM regression set (`bun test:llm`, against the real providers): read over
the artboard world (`artboardState(now)`, account zone Europe/Moscow) from the field `domain`,
the answer must propose `kinds` in order; `first` lists fields the first action must have.
*/
export type RegressionCase = {
  readonly name: string;
  readonly text: string;
  readonly domain: "auto" | ParseDomain;
  readonly now: string;
  readonly expect: {
    readonly kinds: readonly ActionKind[];
    /** The domain the answer names; with `auto`, at least `minConfidence` sure of it. */
    readonly domain?: ParseDomain;
    readonly minConfidence?: number;
    readonly first?: Readonly<Record<string, unknown>>;
  };
};

export const REGRESSION_CASES: readonly RegressionCase[] = [
  {
    domain: "task",
    expect: {
      first: { task: { presetId: "work", title: "созвониться с Петей про дашборд" } },
      kinds: ["task.create"],
    },
    name: "create: a call with a day and a time",
    now: NOW,
    text: "созвониться с Петей про дашборд в пятницу вечером",
  },
  {
    domain: "task",
    expect: { first: { task: { presetId: "hw.algebra" } }, kinds: ["task.create"] },
    name: "create: a pasted homework lands on its course",
    now: HW_VIEW_NOW,
    text: "Алгебра: №№ 290, 292, 293 — решить методом выделения линейных множителей. № 365",
  },
  {
    domain: "task",
    expect: { first: { taskId: BOOKS_ID }, kinds: ["task.update"] },
    name: "update: move a task's due date",
    now: NOW,
    text: "библиотечные книги перенеси на пятницу",
  },
  {
    domain: "task",
    expect: { first: { taskId: BOOKS_ID }, kinds: ["task.delete"] },
    name: "delete: a task named loosely",
    now: NOW,
    text: "удали задачу про библиотечные книги",
  },
  {
    domain: "task",
    expect: { first: { outcome: "done", taskId: REPLY_ID }, kinds: ["task.close"] },
    name: "close: a task done",
    now: NOW,
    text: "ответил куратору курса",
  },
  {
    domain: "activity",
    expect: {
      first: { end: "2026-10-06T05:30:00.000Z", start: "2026-10-06T04:30:00.000Z" },
      kinds: ["activity.log"],
    },
    name: "log: a past span typed with dashes",
    now: NOW,
    text: "7:30 - 8:30 - ходил в военкомат.",
  },
  {
    domain: "activity",
    expect: { first: { expectMinutes: 20 }, kinds: ["activity.start"] },
    name: "start: what the person is doing, with a length",
    now: NOW,
    text: "Пошёл в ЦСС, 20 мин",
  },
  {
    domain: "auto",
    expect: { domain: "activity", kinds: ["activity.log"], minConfidence: 0.8 },
    name: "auto: a night's sleep is time spent",
    now: NOW,
    text: "вчера с 23:00 до 7:00 спал",
  },
  {
    domain: "auto",
    expect: { domain: "task", kinds: ["task.create"], minConfidence: 0.8 },
    name: "auto: something to buy is a task",
    now: NOW,
    text: "купить кабель USB-C до пятницы",
  },
];
