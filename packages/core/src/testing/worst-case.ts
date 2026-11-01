import type { Language } from "../i18n/language.ts";
import type {
  GalleryBlock,
  GalleryData,
  GalleryProject,
  GallerySession,
  GallerySet,
  GallerySignIn,
  GallerySubtask,
  GalleryTask,
} from "./gallery-types.ts";

import { ACTION_LIMITS } from "../actions/limits.ts";
import { ACTIVITY_LABEL_MAX } from "../events/payloads.ts";
import { demoData, emptyData, oneData } from "./gallery-demo.ts";
import {
  colorAt,
  filler,
  IPV6,
  LONG_WORD,
  NAME_80,
  PHRASES,
  PLURAL_COUNTS,
  PROJECT_PHRASES,
  RUNNING_LABELS,
  task,
  UNBREAKABLE_URL,
} from "./gallery-text.ts";

/*
Worst-case data for the dev gallery (`/dev/gallery`) and the overflow sweep (`e2e/worst-case`).
Pure data, no clock and no store: the app turns it into the view-models its components take.
Every length is tied to a limit of the contract (assistant caps, `ACTIVITY_LABEL_MAX`), because
text that fits the limits must fit the layout; the event schema itself leaves titles unbounded.
*/

/** Twelve project names: ten of 78 to 100 characters, a one-letter one and an emoji-first one. */
const worstProjects = (language: Language): readonly GalleryProject[] => [
  ...Array.from({ length: 10 }, (_, index) => ({
    color: colorAt(index),
    id: `project-${String(index)}`,
    // 78..96 characters, each different, so no two tags look alike.
    name: filler(`${String(index + 1)}. ${PROJECT_PHRASES[language]}`, 78 + index * 2),
  })),
  { color: "pink", id: "project-10", name: "Я" },
  { color: "teal", id: "project-11", name: "🏠 Дом и семья שלום עולם" },
];

/** Titles at the contract's edges: schema max, one letter, a URL, an emoji, a right-to-left run. */
const worstTasks = (language: Language): readonly GalleryTask[] => [
  task(0, filler(PHRASES[language], ACTION_LIMITS.title), {
    importance: "asap",
    leftMinutes: 23 * 60 + 59,
    projectId: "project-0",
    subtasksLeft: 12,
  }),
  task(1, "Я", { importance: "prioritized", projectId: "project-10" }),
  task(2, UNBREAKABLE_URL, { projectId: "project-1" }),
  task(3, "🏠 Дом и семья: убрать, купить, позвонить", {
    isRepeating: true,
    projectId: "project-11",
  }),
  task(4, "שלום עולם: проверить письмо מהבנק", { projectId: "project-2" }),
  task(5, LONG_WORD[language], { importance: "nice_to_have", isDimmed: true }),
  task(6, `${LONG_WORD[language]} ${filler(PHRASES[language], 120)}`, {
    importance: "prioritized",
    projectId: "project-9",
    subtasksLeft: 1,
  }),
  task(7, "x"),
];

const worstSubtasks = (language: Language): readonly GallerySubtask[] => [
  ...Array.from({ length: 36 }, (_, index) => ({
    id: `subtask-${String(index + 1)}`,
    isSolved: true,
    label: String(index + 1),
    number: index + 1,
  })),
  {
    id: "subtask-37",
    isSolved: true,
    label: filler(PHRASES[language], ACTION_LIMITS.subtaskLabel),
    number: null,
  },
];

type BlockSpec = {
  readonly at: readonly [day: number, startMinute: number, minutes: number];
  readonly look: readonly [GalleryBlock["category"], GalleryBlock["color"]];
  readonly label: string;
  readonly isAlongside?: boolean;
};

const block = (id: string, spec: BlockSpec): GalleryBlock => ({
  category: spec.look[0],
  color: spec.look[1],
  day: spec.at[0],
  id,
  isAlongside: spec.isAlongside ?? false,
  label: spec.label,
  minutes: spec.at[2],
  startMinute: spec.at[1],
});

const worstBlocks = (language: Language): readonly GalleryBlock[] => {
  const label = filler(RUNNING_LABELS[language], ACTIVITY_LABEL_MAX);
  return [
    // Three blocks at one hour of Monday, two of them inside the first.
    block("b0", { at: [0, 9 * 60, 90], label, look: ["work", "blue"] }),
    block("b1", { at: [0, 9 * 60 + 15, 60], isAlongside: true, label, look: ["study", "violet"] }),
    block("b2", { at: [0, 9 * 60 + 30, 30], label: "Я", look: ["task", "green"] }),
    // One minute (a block of 30 seconds shows as one), and one of 23 h 59 m that fills its day.
    block("b3", { at: [1, 12 * 60, 1], label, look: ["rest", "teal"] }),
    block("b4", { at: [2, 0, 23 * 60 + 59], label, look: ["sleep", "slate"] }),
    block("b5", { at: [3, 13 * 60, 45], label: "🍽️ Обед שלום", look: ["food", "orange"] }),
    block("b6", { at: [3, 13 * 60, 45], isAlongside: true, label, look: ["sport", "coral"] }),
  ];
};

const worstSessions = (language: Language): readonly GallerySession[] => [
  {
    id: "s0",
    kind: "agent",
    meta: [filler(NAME_80[language], 80), IPV6, "last seen 23:10"],
    name: filler(NAME_80[language], 80),
  },
  { id: "s1", kind: "browser", meta: ["Я", IPV6], name: "Я" },
  { id: "s2", kind: "mcp", meta: [UNBREAKABLE_URL.slice(0, 80)], name: "Claude" },
];

const WORST_OWNER = "🌿 Bartholomew-Maximilian-Alexander-Konstantin-Wolfgang-Theodor";

const WORST_SIGN_IN = (language: Language): GallerySignIn => ({
  city: filler(NAME_80[language], 80),
  country: "DE",
  ip: IPV6,
  name: filler(NAME_80[language], 120),
});

const worstData = (language: Language): GalleryData => ({
  alongside: {
    category: "chores",
    color: "amber",
    expectMinutes: null,
    label: "Я",
    minutes: 0,
  },
  blocks: worstBlocks(language),
  description: filler(PHRASES[language], 4000),
  durations: [0, 1, 1439],
  inboxCount: 120,
  inboxTexts: [filler(PHRASES[language], 1200), UNBREAKABLE_URL, LONG_WORD[language]],
  language,
  link: `https://example.com/${filler("a-very-long-path-segment/", ACTION_LIMITS.link - 20)}`,
  ownerName: WORST_OWNER,
  pluralCounts: PLURAL_COUNTS,
  projects: worstProjects(language),
  running: {
    category: "work",
    color: "blue",
    expectMinutes: 1440,
    label: filler(RUNNING_LABELS[language], ACTIVITY_LABEL_MAX),
    minutes: 23 * 60 + 59,
  },
  sessions: worstSessions(language),
  set: "worst",
  signIn: WORST_SIGN_IN(language),
  subtasks: worstSubtasks(language),
  tasks: worstTasks(language),
});

/** The gallery's data for one set in one language: always the same, built fresh. */
export const galleryData = (set: GallerySet, language: Language): GalleryData => {
  switch (set) {
    case "demo": {
      return demoData(language);
    }
    case "empty": {
      return emptyData(language);
    }
    case "one": {
      return oneData(language);
    }
    case "worst": {
      return worstData(language);
    }
  }
};
