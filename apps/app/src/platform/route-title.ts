import type { MessageKey } from "@pace/core";

/** Each route's first segment and the title its screen shows. */
const TITLES: Readonly<Record<string, MessageKey>> = {
  "": "nav.now",
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

/** The title key of the screen at `path` (its first segment decides), or null for none. */
export const routeTitleKey = (path: string): MessageKey | null => {
  const [first = ""] =
    path
      .split(/[?#]/u, 1)[0]
      ?.split("/")
      .filter((part) => part !== "") ?? [];
  return TITLES[first] ?? null;
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
