import { readdirSync } from "node:fs";
import path from "node:path";

/*
The router's folder, read as expo-router reads it: a file is a route, a `(group)` adds no segment
and `index` is its folder. More's destinations live in the More tab's stack so a phone keeps the tab
bar on them (spec §4.2.27, F-AND-03); their addresses stay what they were.
*/

const APP_DIR = path.resolve(__dirname, "../../app");

/** Every route file under the router's folder, as `(tabs)/(more)/week` (no extension). */
const routeFiles = (): readonly string[] =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the app's own router folder, computed above
  readdirSync(APP_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
    .map((entry) =>
      path
        .relative(APP_DIR, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/")
        .replace(/\.tsx?$/u, ""),
    )
    .filter((file) => !/(?:^|\/)(?:_layout|\+native-intent|\+not-found)$/u.test(file));

/** The address a route file answers, as `/presets/[id]`. */
const addressOf = (file: string): string => {
  const segments = file
    .split("/")
    .filter((segment) => !/^\(.+\)$/u.test(segment) && segment !== "index");
  return `/${segments.join("/")}`;
};

/** The files that answer `address`. */
const filesAt = (address: string): readonly string[] =>
  routeFiles().filter((file) => addressOf(file) === address);

/** More's destinations: the tab bar stays under them on a phone, More selected. */
const MORE_DESTINATIONS = [
  "/more",
  "/week",
  "/projects",
  "/project/[id]",
  "/insights",
  "/history",
  "/settings",
  "/notifications",
  "/presets",
  "/presets/[id]",
  "/decisions",
] as const;

/** Screens pushed over the tabs (a task opens from several tabs), and signing in. */
const OVER_THE_TABS = [
  "/task/[id]",
  "/login",
  "/auth",
  "/auth/telegram",
  "/app/auth",
  "/app/login",
  "/oauth/authorize",
  "/onboarding",
  "/permissions",
  "/review",
  "/dev/gallery",
] as const;

describe("the router's folder", () => {
  it("answers every address with exactly one route file", () => {
    const addresses = routeFiles().map((file) => addressOf(file));
    expect(addresses.filter((address, index) => addresses.indexOf(address) !== index)).toEqual([]);
  });

  it.each(MORE_DESTINATIONS)("keeps %s in the More tab's stack, at the same address", (address) => {
    const files = filesAt(address);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\(tabs\)\/\(more\)\//u);
  });

  it.each(OVER_THE_TABS)("keeps %s a screen of the root stack, over the tabs", (address) => {
    const files = filesAt(address);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toMatch(/^\(tabs\)\//u);
  });
});
