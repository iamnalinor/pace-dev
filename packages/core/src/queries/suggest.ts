import { tz } from "@date-fns/tz";
import { addDays, set } from "date-fns";

import type { CoreState } from "../materialize/core-state.ts";
import type { Importance, Preset } from "../model/preset.ts";
import type { Task } from "../model/task.ts";

import { type BasePresetId, isBuiltInPreset } from "../presets/base-presets.ts";
import { presetChain } from "../presets/resolve-preset.ts";
import { formatInZone, startOfDayIn } from "../time.ts";
import { accountTz, type QueryContext } from "./context.ts";

/**
Rule-based triage of an inbox text until the LLM parse of stage 2 takes over: a preset
and a project by name, a family of words that points at work or study, weekday words
for a due date, urgency words for ASAP. Everything else stays personal and Nice-to-have.
*/
export type Suggestion = {
  readonly presetId: string;
  readonly projectId: null | string;
  readonly importance: Importance;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
};

/** A deadline this close makes a captured item Prioritized rather than Nice-to-have. */
const PRIORITIZED_WITHIN_DAYS = 7;

const DEFAULT_PRESET = "personal";

/** The shortest common prefix that counts as the same word. */
const STEM_LENGTH = 4;

/** Latin equivalents of Cyrillic letters, enough to compare "алгебра" with "Algebra". */
const CYRILLIC: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const normalize = (text: string): string => text.toLowerCase().replaceAll("ё", "е");

const fold = (word: string): string =>
  normalize(word).replaceAll(/\p{Script=Cyrillic}/gu, (char) => CYRILLIC[char] ?? char);

const tokensOf = (text: string): readonly string[] =>
  normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== "");

/** A case ending ("алгебре" for "Algebra") changes at most this many trailing letters. */
const ENDING_SLACK = 2;

/** Length of the shared start of two folded words (folded text is plain Latin letters). */
const commonPrefix = (a: string, b: string): number => {
  const differs = Array.from({ length: Math.min(a.length, b.length) }, (_, index) => index).find(
    (index) => a[index] !== b[index],
  );
  return differs ?? Math.min(a.length, b.length);
};

/**
Two words are the same when one starts with the other and the shared part is long enough,
or when only a short ending differs ("алгебре", "algebra").
*/
const isSameWord = (token: string, word: string): boolean => {
  const a = fold(token);
  const b = fold(word);
  const isLongEnough = Math.min(a.length, b.length) >= STEM_LENGTH;
  const sharedNeeded = Math.max(STEM_LENGTH + 1, Math.max(a.length, b.length) - ENDING_SLACK);
  return isLongEnough && (a.startsWith(b) || b.startsWith(a) || commonPrefix(a, b) >= sharedNeeded);
};

const nameWords = (name: string): readonly string[] =>
  name.split(/\s+/u).filter((word) => word.length >= STEM_LENGTH);

const hasNameWord = (tokens: readonly string[], name: string): boolean =>
  nameWords(name).some((word) => tokens.some((token) => isSameWord(token, word)));

/** A short keyword must match whole; a longer one is a stem. */
const hasKeyword = (tokens: readonly string[], keywords: readonly string[]): boolean =>
  keywords.some((keyword) =>
    tokens.some((token) =>
      keyword.length < STEM_LENGTH ? token === keyword : token.startsWith(keyword),
    ),
  );

const ASAP_WORDS = ["asap", "urgent", "срочно"];

/** Words that say "homework" outright: they pick the Homework preset when no course is named. */
const HOMEWORK_WORDS = ["hw", "дз", "домашк", "домашн", "homework"];

/** The families the lexicon knows; study words only point at a course, work words at the preset too. */
const FAMILIES = ["work", "hw"] as const;

type Family = (typeof FAMILIES)[number];

/** A grade question is not homework: without a named course the preset stays personal. */
const PRESET_OF_FAMILY: Readonly<Record<Family, null | string>> = { work: "work", hw: null };

/** Words that place a text in a base preset's family, in both interface languages. */
const FAMILY_WORDS: Readonly<Record<Family, readonly string[]>> = {
  work: [
    "work",
    "работ",
    "sync",
    "синк",
    "dashboard",
    "дашборд",
    "metric",
    "метрик",
    "meeting",
    "митинг",
    "встреч",
    "standup",
    "стендап",
    "review",
    "ревью",
    "deploy",
    "деплой",
    "release",
    "релиз",
    "ticket",
    "тикет",
    "jira",
    "pr",
    "bug",
    "баг",
    "report",
    "отчет",
  ],
  hw: [
    "hw",
    "дз",
    "домашк",
    "homework",
    "контрольн",
    "кр",
    "оценк",
    "grade",
    "exam",
    "экзамен",
    "зачет",
    "lecture",
    "лекци",
    "seminar",
    "семинар",
    "quiz",
    "course",
    "курс",
  ],
};

const familyOfText = (tokens: readonly string[]): Family | undefined =>
  FAMILIES.find((family) => hasKeyword(tokens, FAMILY_WORDS[family]));

/** The built-in preset at the root of the task's chain. */
const familyOfTask = (state: CoreState, task: Task): BasePresetId | undefined => {
  const chain = presetChain(state.presets, task.presetId);
  const root = chain.ok ? chain.value[0]?.id : undefined;
  return root !== undefined && isBuiltInPreset(root) ? root : undefined;
};

const byId = (a: { readonly id: string }, b: { readonly id: string }): number => {
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
};

/** User presets before built-ins, so a course wins over "Homework". */
const byUserFirst = (a: Preset, b: Preset): number => {
  if (a.builtIn !== b.builtIn) {
    return a.builtIn ? 1 : -1;
  }
  return a.id < b.id ? -1 : 1;
};

/** A preset that is there and not archived (a default can be archived too). */
const isPresetLive = (state: CoreState, id: string): boolean =>
  state.presets.byId[id]?.archived === false;

const presetByName = (state: CoreState, tokens: readonly string[]): Preset | undefined =>
  Object.values(state.presets.byId)
    .filter((preset) => !preset.archived && preset.id !== "inbox")
    .toSorted(byUserFirst)
    .find((preset) => hasNameWord(tokens, preset.name));

const projectByName = (state: CoreState, tokens: readonly string[]): null | string =>
  Object.values(state.projects.byId)
    .filter((project) => !project.archived)
    .toSorted(byId)
    .find((project) => hasNameWord(tokens, project.name))?.id ?? null;

/** The project of the task worked on most recently among those matching. */
const recentProjectOf = (state: CoreState, isMatch: (task: Task) => boolean): null | string =>
  Object.values(state.tasks.byId)
    .filter((task) => task.projectId !== null && task.touched && isMatch(task))
    .toSorted((a, b) => {
      if (a.lastEventAt !== b.lastEventAt) {
        return a.lastEventAt > b.lastEventAt ? -1 : 1;
      }
      return a.id < b.id ? -1 : 1;
    })[0]?.projectId ?? null;

/** A named project wins; else the project where the matched preset or family was last worked on. */
const projectFor = (
  state: CoreState,
  tokens: readonly string[],
  matched: { readonly preset: Preset | undefined; readonly family: Family | undefined },
): null | string => {
  const named = projectByName(state, tokens);
  if (named !== null) {
    return named;
  }
  const { preset, family } = matched;
  const ofPreset =
    preset === undefined || preset.builtIn
      ? null
      : recentProjectOf(state, (task) => task.presetId === preset.id);
  if (ofPreset !== null) {
    return ofPreset;
  }
  return family === undefined
    ? null
    : recentProjectOf(state, (task) => familyOfTask(state, task) === family);
};

/** ISO weekday 1..7 with the words that name it; a token may carry a case ending. */
const WEEKDAY_WORDS: readonly (readonly [number, readonly string[]])[] = [
  [1, ["monday", "понедельник"]],
  [2, ["tuesday", "вторник"]],
  [3, ["wednesday", "сред"]],
  [4, ["thursday", "четверг"]],
  [5, ["friday", "пятниц"]],
  [6, ["saturday", "суббот"]],
  [7, ["sunday", "воскресень"]],
];

const RELATIVE_DAY_WORDS: readonly (readonly [number, readonly string[]])[] = [
  [0, ["today", "сегодня"]],
  [1, ["tomorrow", "завтра"]],
];

/** At most two letters of ending after the stem, so "среда" matches and "средний" does not. */
const ENDING_LENGTH = 2;

const isDayWord = (token: string, stem: string): boolean =>
  token.startsWith(stem) && token.length - stem.length <= ENDING_LENGTH;

const DAYS_PER_WEEK = 7;

/** Days from today to the named day, today included (a Friday "by Friday" is today). */
const daysAhead = (tokens: readonly string[], now: string, zone: string): number | undefined => {
  const relative = RELATIVE_DAY_WORDS.find(([, words]) =>
    words.some((word) => tokens.includes(word)),
  );
  if (relative !== undefined) {
    return relative[0];
  }
  const weekday = WEEKDAY_WORDS.find(([, stems]) =>
    stems.some((stem) => tokens.some((token) => isDayWord(token, stem))),
  );
  if (weekday === undefined) {
    return undefined;
  }
  const today = Number(formatInZone(now, zone, "i"));
  return (weekday[0] - today + DAYS_PER_WEEK) % DAYS_PER_WEEK;
};

const END_OF_DAY = { hours: 23, minutes: 59, seconds: 0, milliseconds: 0 };

/** 23:59 on the zone's calendar `days` days after today; wall-clock safe across DST. */
const endOfDayAhead = (now: string, zone: string, days: number): string => {
  const context = { in: tz(zone) };
  const day = addDays(startOfDayIn(now, zone), days, context);
  return new Date(set(day, END_OF_DAY, context)).toISOString();
};

const MS_PER_DAY = 24 * 3_600_000;

const importanceFor = (
  tokens: readonly string[],
  dueAt: null | string,
  now: string,
): Importance => {
  if (hasKeyword(tokens, ASAP_WORDS)) {
    return "asap";
  }
  const isSoon =
    dueAt !== null && Date.parse(dueAt) - Date.parse(now) <= PRIORITIZED_WITHIN_DAYS * MS_PER_DAY;
  return isSoon ? "prioritized" : "nice_to_have";
};

export const suggestFor = (state: CoreState, text: string, ctx: QueryContext): Suggestion => {
  const tokens = tokensOf(text);
  const zone = accountTz(state, ctx);
  const preset = presetByName(state, tokens);
  const family = familyOfText(tokens);
  const ahead = daysAhead(tokens, ctx.now, zone);
  const dueAt = ahead === undefined ? null : endOfDayAhead(ctx.now, zone, ahead);
  const isHomework = hasKeyword(tokens, HOMEWORK_WORDS) && isPresetLive(state, "hw");
  return {
    presetId:
      preset?.id ??
      (isHomework ? "hw" : null) ??
      (family === undefined ? null : PRESET_OF_FAMILY[family]) ??
      DEFAULT_PRESET,
    projectId: projectFor(state, tokens, { preset, family }),
    importance: importanceFor(tokens, dueAt, ctx.now),
    dueAt,
    dueTz: dueAt === null ? null : zone,
  };
};
