import { readdirSync } from "node:fs";
import path from "node:path";

import type { LivedIn } from "./seed.ts";

/**
The app's screens as the router knows them: every route file under `apps/app/app`, so a sweep that
loops over them covers a new screen without anyone adding it (bug-lessons class 90: a guard that
names the routes it covers by hand misses the next screen).
*/

const APP_DIR = path.resolve(import.meta.dirname, "../../apps/app/app");

/**
Screens that are not meant to have the sidebar: signing in (and its way back) and the walk-through.
A copy of `BARE_PATHS` in apps/app/src/auth/route-gate.tsx (e2e may not import from the app); keep
the two lists the same.
*/
const BARE = ["/login", "/auth", "/app/auth", "/app/login", "/onboarding", "/oauth"];

/** Whether `url` is signing in, its way back or the walk-through. */
export const isBare = (url: string): boolean =>
  BARE.some((bare) => url === bare || url.startsWith(`${bare}/`));

/** Every file under the router's folder, as `/(tabs)/day.tsx`. */
const routeFiles = (): readonly string[] =>
  readdirSync(APP_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${path.relative(APP_DIR, path.join(entry.parentPath, entry.name))}`);

/** A route file as the URLs that open it on an account with `ids` (none for layouts and hooks). */
const urlsOf = (file: string, ids: LivedIn): readonly string[] => {
  const route = file
    .replace(/\.tsx?$/u, "")
    .replaceAll(/\/\([^)]+\)/gu, "")
    .replace(/\/index$/u, "");
  if (/(?:^|\/)_layout$|\+native-intent$/u.test(route)) {
    return [];
  }
  if (route.endsWith("+not-found")) {
    return ["/no-such-page"];
  }
  if (route === "/task/[id]") {
    return [`/task/${ids.openTaskId}`, `/task/${ids.doneTaskId}`, `/task/${ids.repeatingTaskId}`];
  }
  if (route === "/project/[id]") {
    return [`/project/${ids.algebraId}`];
  }
  if (route === "/presets/[id]") {
    return ["/presets/hw.seeded"];
  }
  return [route === "" ? "/" : route];
};

/** Every URL that opens a screen of the app, the dynamic ones with `ids`. */
export const screenUrls = (ids: LivedIn): readonly string[] =>
  routeFiles().flatMap((file) => urlsOf(file, ids));

/**
Stand-ins for a dynamic route's id where the account has none (signed out, or a fresh account):
the screen shows what it shows for an id it does not know.
*/
export const STAND_IN_IDS: LivedIn = {
  algebraId: "01STANDIN0000000000000000A",
  doneTaskId: "01STANDIN0000000000000000D",
  openTaskId: "01STANDIN0000000000000000O",
  repeatingTaskId: "01STANDIN0000000000000000R",
};

/**
Where a signed-in direct load of `url` should stay (QA round 17 M2: Day and Inbox came back as `/`,
so a reload landed on Now): its own address, except the screens that only send the person on.
Signing in and the walk-through send a signed-in person on as well, and are not judged here.
*/
export const expectedLanding = (isWide: boolean, url: string): null | string => {
  if (isBare(url)) {
    return null;
  }
  if (url === "/review") {
    return "/inbox";
  }
  return url === "/more" && isWide ? "/" : url;
};

/** On a desktop every screen but signing in and the walk-through keeps the sidebar. */
export const isSidebarScreen = (isWide: boolean, url: string): boolean => isWide && !isBare(url);
