import type { MessageKey } from "@pace/core";

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

/**
The title key of the screen at `path` (its first segment decides), or null for none; a path no
route answers is "Page not found", as the page says (QA round 17 L11).
*/
export const routeTitleKey = (path: string): MessageKey | null => {
  const [first = ""] =
    path
      .split(/[?#]/u, 1)[0]
      ?.split("/")
      .filter((part) => part !== "") ?? [];
  const key = TITLES[first];
  return key === undefined ? "errors.pageNotFound" : key;
};

/**
"Settings · Pace": the browser tab and its history say which screen it is, then the app's name
(`app.name`, as the login card's wordmark), alone where no screen is named.
*/
export const documentTitle = (path: string, say: (key: MessageKey) => string): string => {
  const key = routeTitleKey(path);
  const app = say("app.name");
  return key === null ? app : `${say(key)} · ${app}`;
};
