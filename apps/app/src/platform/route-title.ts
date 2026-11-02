import type { AppState } from "@pace/client";

import {
  type Language,
  type MessageKey,
  presetById,
  presetLabel,
  projectById,
  taskById,
} from "@pace/core";

/** Each route's first segment and the title its screen shows. */
const TITLES: Readonly<Record<string, MessageKey | null>> = {
  "": "nav.now",
  add: "nav.add",
  // Signing in and its ways back: the app's name alone.
  app: null,
  auth: null,
  oauth: null,
  day: "nav.day",
  decisions: "decisions.title",
  history: "history.title",
  inbox: "nav.inbox",
  insights: "nav.insights",
  login: "login.title",
  more: "nav.more",
  notifications: "notifications.title",
  onboarding: "onboarding.title",
  permissions: "permissions.title",
  presets: "presets.title",
  project: "nav.projects",
  projects: "nav.projects",
  review: "review.title",
  settings: "settings.title",
  task: "nav.task",
  week: "nav.week",
};

/** The path's segments, without its query, its hash and empty parts. */
const segmentsOf = (path: string): readonly string[] =>
  path
    .split(/[?#]/u, 1)[0]
    ?.split("/")
    .filter((part) => part !== "") ?? [];

/**
The title key of the screen at `path` (its first segment decides), or null for none; a path no
route answers is "Page not found", as the page says (QA round 17 L11).
*/
export const routeTitleKey = (path: string): MessageKey | null => {
  const [first = ""] = segmentsOf(path);
  const key = TITLES[first];
  return key === undefined ? "errors.pageNotFound" : key;
};

/** The one thing a detail screen shows: `/task/<id>`, `/project/<id>`, `/presets/<id>`. */
export type RouteSubject = { readonly kind: "preset" | "project" | "task"; readonly id: string };

const SUBJECTS: Readonly<Record<string, RouteSubject["kind"]>> = {
  presets: "preset",
  project: "project",
  task: "task",
};

/** What the screen at `path` is about, or null for a screen about no one thing. */
export const routeSubject = (path: string): null | RouteSubject => {
  const [first = "", id] = segmentsOf(path);
  const kind = Object.hasOwn(SUBJECTS, first) ? SUBJECTS[first] : undefined;
  return kind === undefined || id === undefined ? null : { id: decodeURIComponent(id), kind };
};

/**
The name a person sees for the thing: the task's title and the project's name as typed, a preset
the way the pickers name it (a default one in the reader's language unless renamed); null when
it is not there (yet).
*/
export const subjectName = (
  state: Pick<AppState, "presets" | "projects" | "tasks">,
  subject: RouteSubject,
  language: Language,
): null | string => {
  switch (subject.kind) {
    case "preset": {
      const preset = presetById(state.presets, subject.id);
      return preset === undefined ? null : presetLabel(preset, language);
    }
    case "project": {
      return projectById(state.projects, subject.id)?.name ?? null;
    }
    case "task": {
      return taskById(state.tasks, subject.id)?.title ?? null;
    }
  }
};

/** The subject's name, the new preset's title, or null for a screen about no one thing. */
const subjectTitle = (
  subject: null | RouteSubject,
  say: (key: MessageKey) => string,
  nameOf: (subject: RouteSubject) => null | string,
): null | string => {
  if (subject === null) {
    return null;
  }
  return subject.kind === "preset" && subject.id === "new" ? say("presets.new") : nameOf(subject);
};

/**
"Settings · Pace": the browser tab and its history say which screen it is, then the app's name
(`app.name`, as the login card's wordmark), alone where no screen is named. A screen about one
thing is named by it, in the person's own words ("Algebra HW 6 · Pace", QA round 18 L8; `nameOf`
looks it up), by the screen's name while it cannot be found, and the new preset form is "New
preset".
*/
export const documentTitle = (
  path: string,
  say: (key: MessageKey) => string,
  nameOf: (subject: RouteSubject) => null | string = () => null,
): string => {
  const key = routeTitleKey(path);
  const app = say("app.name");
  if (key === null) {
    return app;
  }
  const named = subjectTitle(routeSubject(path), say, nameOf);
  return `${named === null || named.trim() === "" ? say(key) : named} · ${app}`;
};
