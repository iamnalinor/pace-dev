import type { Language } from "../i18n/language.ts";
import type {
  GalleryBlock,
  GalleryData,
  GalleryProject,
  GalleryRunning,
  GallerySession,
  GallerySignIn,
  GalleryTask,
} from "./gallery-types.ts";

import { colorAt, PLURAL_COUNTS, task } from "./gallery-text.ts";

/** The sets with realistic data (demo, one of each) and the empty one. */

const demoTasks = (language: Language): readonly GalleryTask[] => {
  const titles: Readonly<Record<Language, readonly string[]>> = {
    en: [
      "Algebra homework 6",
      "Book the dentist",
      "Read chapter 4",
      "Reply to Maria",
      "Water the plants",
    ],
    ru: [
      "Домашка по алгебре 6",
      "Записаться к стоматологу",
      "Прочитать главу 4",
      "Ответить Марии",
      "Полить цветы",
    ],
  };
  return titles[language].map((title, index) =>
    task(index, title, {
      importance:
        (["asap", "prioritized", "normal", "normal", "nice_to_have"] as const)[index] ?? "normal",
      isDimmed: index === 4,
      isRepeating: index === 0,
      leftMinutes: index < 2 ? 90 + index * 300 : null,
      projectId: index < 3 ? `project-${String(index)}` : null,
      subtasksLeft: index === 0 ? 3 : 0,
    }),
  );
};

const demoProjects = (language: Language): readonly GalleryProject[] => {
  const names: Readonly<Record<Language, readonly string[]>> = {
    en: ["Algebra", "Health", "Reading"],
    ru: ["Алгебра", "Здоровье", "Чтение"],
  };
  return names[language].map((name, index) => ({
    color: colorAt(index),
    id: `project-${String(index)}`,
    name,
  }));
};

const DEMO_RUNNING: Readonly<Record<Language, string>> = {
  en: "Algebra homework 6",
  ru: "Домашка по алгебре 6",
};

const demoRunning = (language: Language): GalleryRunning => ({
  category: "study",
  color: "violet",
  expectMinutes: 60,
  label: DEMO_RUNNING[language],
  minutes: 42,
});

const demoBlocks = (language: Language): readonly GalleryBlock[] => [
  {
    category: "study",
    color: "violet",
    day: 0,
    id: "b0",
    isAlongside: false,
    label: DEMO_RUNNING[language],
    minutes: 90,
    startMinute: 9 * 60,
  },
  {
    category: "rest",
    color: "teal",
    day: 0,
    id: "b1",
    isAlongside: false,
    label: "",
    minutes: 30,
    startMinute: 11 * 60,
  },
  {
    category: "work",
    color: "blue",
    day: 1,
    id: "b2",
    isAlongside: false,
    label: "",
    minutes: 120,
    startMinute: 10 * 60,
  },
];

const NAMES: Readonly<Record<Language, readonly string[]>> = {
  en: ["Anna", "Pace on Anna's laptop", "Firefox on Linux"],
  ru: ["Анна", "Pace на ноутбуке Анны", "Firefox на Linux"],
};

const demoSessions = (language: Language): readonly GallerySession[] => [
  { id: "s0", kind: "agent", meta: ["Linux", "23:10"], name: NAMES[language][1] ?? "" },
  { id: "s1", kind: "browser", meta: ["Firefox", "12:40"], name: NAMES[language][2] ?? "" },
];

const DEMO_SIGN_IN: GallerySignIn = {
  city: "Berlin",
  country: "DE",
  ip: "203.0.113.7",
  name: "Firefox on Linux",
};

export const emptyData = (language: Language): GalleryData => ({
  alongside: null,
  blocks: [],
  description: null,
  durations: [0],
  inboxCount: 0,
  inboxTexts: [],
  language,
  link: null,
  ownerName: null,
  pluralCounts: [0],
  projects: [],
  running: null,
  sessions: [],
  set: "empty",
  signIn: null,
  subtasks: [],
  tasks: [],
});

export const demoData = (language: Language): GalleryData => ({
  alongside: null,
  blocks: demoBlocks(language),
  description: null,
  durations: [0, 5, 90],
  inboxCount: 3,
  inboxTexts: [language === "ru" ? "Купить молоко и позвонить маме" : "Buy milk and call mum"],
  language,
  link: null,
  ownerName: NAMES[language][0] ?? null,
  pluralCounts: PLURAL_COUNTS,
  projects: demoProjects(language),
  running: demoRunning(language),
  sessions: demoSessions(language),
  set: "demo",
  signIn: DEMO_SIGN_IN,
  subtasks: [
    { id: "subtask-1", isSolved: true, label: "1", number: 1 },
    { id: "subtask-2", isSolved: true, label: "2", number: 2 },
    { id: "subtask-3", isSolved: false, label: "3", number: 3 },
  ],
  tasks: demoTasks(language),
});

export const oneData = (language: Language): GalleryData => {
  const demo = demoData(language);
  return {
    ...demo,
    alongside: null,
    blocks: demo.blocks.slice(0, 1),
    durations: [1],
    inboxCount: 1,
    inboxTexts: demo.inboxTexts.slice(0, 1),
    pluralCounts: [1],
    projects: demo.projects.slice(0, 1),
    sessions: demo.sessions.slice(0, 1),
    set: "one",
    subtasks: demo.subtasks.slice(0, 1),
    tasks: demo.tasks.slice(0, 1).map((first) => ({ ...first, subtasksLeft: 1 })),
  };
};
