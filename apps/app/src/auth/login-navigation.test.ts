import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** The app's own sources: the router's folder and `src`, tests left out. */
const APP = path.resolve(__dirname, "../..");

const sourceFiles = (): readonly string[] =>
  [path.join(APP, "app"), path.join(APP, "src")].flatMap((folder) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the app's own folders, computed above
    readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
      .filter((entry) => !/\.test\.tsx?$/u.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name)),
  );

/**
The files that may name the login route: the route gate (which takes a signed-out device there) and
the bare screens of the sign-in flow itself (where the gate does not run).
*/
const MAY_NAME_LOGIN: readonly string[] = [
  "src/auth/route-gate.tsx",
  "src/auth/telegram-return.ts",
  "src/screens/auth-screen.tsx",
  "src/screens/login-return-screen.tsx",
  "src/screens/telegram-return-screen.tsx",
];

describe("the way to the login card (PR A re-review N1, bug class 75)", () => {
  it("is the route gate's alone: no sign-out flow navigates there after its await", () => {
    const naming = sourceFiles()
      .filter((file) =>
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file the listing above found in the app
        /["'`]\/login["'`]/u.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(APP, file).replaceAll("\\", "/"))
      .toSorted((a, b) => a.localeCompare(b));
    // A Log out, an account deletion or an ended session signs the device out, and the gate
    // redirects at once; a `router.replace("/login")` after the awaited network call then
    // remounted the login screen the person was already typing in.
    expect(naming).toStrictEqual(MAY_NAME_LOGIN);
  });
});
