import { describe, expect, it } from "bun:test";
import { ESLint } from "eslint";
import path from "node:path";

/**
The bans scoped to some folders, read from the resolved config so a glob that drifts away from a
folder fails here. The display-text bans (bug-lessons 110 and 111: `toFixed`, cutting the first
UTF-16 unit) cover every source that builds text a person reads: the app and the client's
view-models, tests aside. The app never drops an action's answer (bug-lessons 108).
*/
const ROOT = path.join(import.meta.dir, "..");
const eslint = new ESLint({ cwd: ROOT });

/** A `no-restricted-syntax` entry: its selector, or the entry itself when it is a bare string. */
const selectorOf = (option: unknown): string =>
  String(
    typeof option === "object" && option !== null && "selector" in option
      ? option.selector
      : option,
  );

const restrictedSelectors = async (file: string): Promise<readonly string[]> => {
  const config = (await eslint.calculateConfigForFile(path.join(ROOT, file))) as {
    readonly rules?: Readonly<Record<string, unknown>>;
  };
  const setting: unknown = config.rules?.["no-restricted-syntax"];
  return Array.isArray(setting)
    ? setting.slice(1).map((option: unknown) => selectorOf(option))
    : [];
};

const isBanningDisplayText = (selectors: readonly string[]): boolean =>
  selectors.some((selector) => selector.includes("toFixed")) &&
  selectors.some((selector) => selector.includes("charAt"));

describe("the display-text bans", () => {
  it.each([
    "apps/app/src/features/week/week-screen.tsx",
    "packages/client/src/view-models/insights-text.ts",
    "packages/client/src/view-models/time-bar.ts",
  ])("apply to %s", async (file) => {
    expect(isBanningDisplayText(await restrictedSelectors(file))).toBe(true);
  });

  it.each([
    "packages/client/src/view-models/insights-text.test.ts",
    "packages/client/src/state.ts",
    "packages/core/src/i18n/i18n.ts",
  ])("leave %s alone (a test, or code that prints no text)", async (file) => {
    expect(isBanningDisplayText(await restrictedSelectors(file))).toBe(false);
  });
});

/** Type-aware linting of one app file builds the app's program: seconds, not milliseconds. */
const LINT_APP_FILE_MS = 60_000;

describe("an action's answer in the app", () => {
  it(
    "is never dropped with void, but may go to run(), and ensureInstances (a count) may",
    async () => {
      const code = [
        "declare const actions: {",
        "  setNightHours: (on: boolean) => Promise<unknown>;",
        "  ensureInstances: () => Promise<number>;",
        "};",
        "declare const runtime: { actions: typeof actions };",
        "declare const run: (answer: Promise<unknown>) => Promise<boolean>;",
        "export const a = (): void => { void actions.setNightHours(true); };",
        "export const b = (): void => { void actions.ensureInstances(); };",
        "export const c = (): void => { void run(actions.setNightHours(true)); };",
        "export const d = (): void => { void runtime.actions.setNightHours(true); };",
      ].join("\n");
      const [result] = await eslint.lintText(code, {
        filePath: path.join(ROOT, "apps/app/src/features/week/week-screen.tsx"),
      });
      const flagged = (result?.messages ?? [])
        .filter((message) => message.message.startsWith("An action's answer is never dropped"))
        .map((message) => message.line);
      expect(flagged).toEqual([7, 10]);
    },
    LINT_APP_FILE_MS,
  );
});

/** The `no-restricted-imports` setting for one file: its severity and options, or `undefined`. */
const restrictedImports = async (file: string): Promise<unknown> => {
  const config = (await eslint.calculateConfigForFile(path.join(ROOT, file))) as {
    readonly rules?: Readonly<Record<string, unknown>>;
  };
  return config.rules?.["no-restricted-imports"];
};

/** The names a `no-restricted-imports` setting bans from `react-native`. */
const bannedFromReactNative = (setting: unknown): readonly string[] => {
  if (!Array.isArray(setting) || setting[0] === 0 || setting[0] === "off") {
    return [];
  }
  return setting.slice(1).flatMap((option: unknown) => {
    const paths =
      typeof option === "object" && option !== null && "paths" in option
        ? (option.paths as readonly {
            readonly importNames?: readonly string[];
            readonly name: string;
          }[])
        : [];
    return paths
      .filter(({ name }) => name === "react-native")
      .flatMap(({ importNames }) => importNames ?? []);
  });
};

describe("a bare pressable (bug-lessons F-CMP-01)", () => {
  it.each(["apps/app/src/features/week/week-screen.tsx", "apps/app/src/shared/task-row.tsx"])(
    "is banned from react-native in %s: the kit's Pressable draws the state layer",
    async (file) => {
      const banned = bannedFromReactNative(await restrictedImports(file));
      expect(banned).toContain("Pressable");
      expect(banned).toContain("TouchableOpacity");
    },
  );

  it.each(["apps/app/src/ui/pressable.tsx", "apps/app/src/features/week/week-screen.test.tsx"])(
    "is allowed in %s (the kit itself, or a test)",
    async (file) => {
      expect(bannedFromReactNative(await restrictedImports(file))).toEqual([]);
    },
  );

  it(
    "is reported with the way to the kit",
    async () => {
      const [result] = await eslint.lintText(
        'import { Pressable, Text } from "react-native";\nexport const a = [Pressable, Text];\n',
        { filePath: path.join(ROOT, "apps/app/src/features/week/week-screen.tsx") },
      );
      const flagged = (result?.messages ?? []).filter(
        (message) => message.ruleId === "no-restricted-imports",
      );
      expect(flagged).toHaveLength(1);
      expect(flagged[0]?.message).toContain("#app/ui/pressable");
    },
    LINT_APP_FILE_MS,
  );
});

/** The `pace/kit-primitives` severity for one file (bug-lessons 109: icons and line limits from the kit). */
const kitPrimitives = async (file: string): Promise<unknown> => {
  const config = (await eslint.calculateConfigForFile(path.join(ROOT, file))) as {
    readonly rules?: Readonly<Record<string, unknown>>;
  };
  const setting: unknown = config.rules?.["pace/kit-primitives"];
  return Array.isArray(setting) ? setting[0] : setting;
};

describe("icons and line limits from the kit (bug-lessons 109)", () => {
  it.each([
    "apps/app/src/features/day/day-screen.tsx",
    "apps/app/src/shared/meta-line.tsx",
    "apps/app/src/screens/more-screen.tsx",
    "apps/app/src/ui/sidebar.tsx",
    "apps/app/app/(tabs)/index.tsx",
  ])("are checked in %s", async (file) => {
    expect(await kitPrimitives(file)).toBe(1);
  });

  it("leave tests alone", async () => {
    expect(await kitPrimitives("apps/app/src/ui/icon.test.tsx")).toBeUndefined();
  });
});
