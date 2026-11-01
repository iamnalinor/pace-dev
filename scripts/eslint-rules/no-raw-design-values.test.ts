// The root workspace has no vitest; Bun's runner exposes the same describe/it API.
import { describe, expect, it } from "bun:test";
import { RuleTester } from "eslint";
import { parser } from "typescript-eslint";

import { plugin } from "./index.ts";
import { noRawDesignValues } from "./no-raw-design-values.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

describe("no-raw-design-values", () => {
  it("names the plugin and versions it by the rule source", () => {
    expect(plugin.meta.name).toBe("pace");
    expect(plugin.meta.version).toMatch(/^[\da-f]{12}$/);
  });

  it("declares the message ids the plan names", () => {
    expect(
      Object.keys(noRawDesignValues.meta?.messages ?? {}).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([
      "arbitraryClass",
      "offScaleClass",
      "rawColor",
      "rawDuration",
      "rawFontMetric",
      "rawRadius",
    ]);
  });
});

const tester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const APP_FILE = "apps/app/src/ui/example.tsx";
const ALLOWED = { allowedClasses: ["p-5", "text-body", "rounded-md", "bg-bg-cell"] };

tester.run("no-raw-design-values", noRawDesignValues, {
  invalid: [
    { code: 'const a = <View style={{ color: "#fff" }} />;', errors: [{ messageId: "rawColor" }] },
    { code: 'const a = "#12345678";', errors: [{ messageId: "rawColor" }] },
    { code: 'const a = "rgba(0,0,0,.5)";', errors: [{ messageId: "rawColor" }] },
    { code: 'const a = "hsl(10 20% 30%)";', errors: [{ messageId: "rawColor" }] },
    { code: "const a = { borderRadius: 12 };", errors: [{ messageId: "rawRadius" }] },
    { code: 'const a = { "borderRadius": 12 };', errors: [{ messageId: "rawRadius" }] },
    { code: "const a = { fontSize: 15 };", errors: [{ messageId: "rawFontMetric" }] },
    { code: "const a = { lineHeight: 20 };", errors: [{ messageId: "rawFontMetric" }] },
    { code: "const a = { letterSpacing: -0.2 };", errors: [{ messageId: "rawFontMetric" }] },
    // Colour names used as style values.
    { code: 'const a = { color: "red" };', errors: [{ messageId: "rawColor" }] },
    { code: 'const a = { backgroundColor: "White" };', errors: [{ messageId: "rawColor" }] },
    { code: 'const a = <Svg fill="rebeccapurple" />;', errors: [{ messageId: "rawColor" }] },
    {
      code: 'const a = <Input placeholderTextColor="gray" />;',
      errors: [{ messageId: "rawColor" }],
    },
    // Logical corner radii.
    { code: "const a = { borderStartStartRadius: 8 };", errors: [{ messageId: "rawRadius" }] },
    { code: "const a = { borderTopEndRadius: 8 };", errors: [{ messageId: "rawRadius" }] },
    // Reanimated builders.
    {
      code: "const a = FadeIn.duration(180).reduceMotion(x);",
      errors: [{ messageId: "rawDuration" }],
    },
    {
      code: "const a = SlideInDown.delay(50).duration(240);",
      errors: [{ messageId: "rawDuration" }, { messageId: "rawDuration" }],
    },
    // Timers: numeric literal or an identifier bound to one in the file.
    {
      code: "const N = 300; const a = withDelay(N, x);",
      errors: [{ messageId: "rawDuration" }],
    },
    {
      code: 'import { x } from "react-native-reanimated"; setTimeout(go, 250);',
      errors: [{ messageId: "rawDuration" }],
    },
    {
      code: 'import { x } from "react-native-reanimated"; const W = 250; function f() { setTimeout(go, W); }',
      errors: [{ messageId: "rawDuration" }],
    },
    // Named durations.
    { code: "const BREATH_MS = 900;", errors: [{ messageId: "rawDuration" }] },
    { code: "export const DISSOLVE_MS = 750;", errors: [{ messageId: "rawDuration" }] },
    { code: "const ENTER_DURATION = 200;", errors: [{ messageId: "rawDuration" }] },
    { code: "const STAGGER_DELAY = 20;", errors: [{ messageId: "rawDuration" }] },
    // Spring physics.
    {
      code: "const a = withSpring(1, { damping: 15, stiffness: 120, mass: 1 });",
      errors: [
        { messageId: "rawDuration" },
        { messageId: "rawDuration" },
        { messageId: "rawDuration" },
      ],
    },
    {
      code: "const a = withTiming(1, { duration: 200 });",
      errors: [{ messageId: "rawDuration" }],
    },
    {
      code: "const a = { duration: 900, reduceMotion: x };",
      errors: [{ messageId: "rawDuration" }],
    },
    { code: "const a = withDelay(120, x);", errors: [{ messageId: "rawDuration" }] },
    { code: "const a = withSpring(1, { duration: 300 });", errors: [{ messageId: "rawDuration" }] },
    {
      code: 'const a = <View className="p-[13px]" />;',
      errors: [{ data: { name: "p-[13px]" }, messageId: "arbitraryClass" }],
    },
    {
      code: 'const a = <View className="rounded-[22px] text-[15px]" />;',
      errors: [{ messageId: "arbitraryClass" }, { messageId: "arbitraryClass" }],
    },
    {
      code: "const a = <View className={`flex p-[13px] ${x}`} />;",
      errors: [{ messageId: "arbitraryClass" }],
    },
    {
      code: 'const a = <View className={cn("p-5", flag && "m-[3px]")} />;',
      errors: [{ messageId: "arbitraryClass" }],
    },
    {
      code: 'const a = <View className={flag ? "w-[7px]" : "w-5"} />;',
      errors: [{ messageId: "arbitraryClass" }],
    },
    {
      code: 'const a = <View className="p-5 p-7" />;',
      errors: [{ data: { name: "p-7" }, messageId: "offScaleClass" }],
      options: [ALLOWED],
    },
    {
      code: 'const a = <View className="p-5 text-[15px]" />;',
      errors: [{ messageId: "arbitraryClass" }],
      options: [ALLOWED],
    },
  ].map((c) => ({ ...c, filename: APP_FILE })),
  valid: [
    'const a = <View className="p-5 text-body rounded-md" />;',
    "const a = <View style={{ borderRadius: radius.md }} />;",
    "const a = withTiming(1, motion.enter.md);",
    "const a = withTiming(1, { duration: motion.duration.fast });",
    "const a = withDelay(delay, x); const b = { duration: 0, other: 5 };",
    // Colour words that are not colours here, and non-colour keys.
    'const a = { color: "transparent", backgroundColor: "inherit", tintColor: "currentColor" };',
    'const a = { color: theme.fg, label: "red", title: "White" };',
    'const a = <Text accessibilityLabel="red">white</Text>;',
    "const a = { borderStartStartRadius: radius.md, borderTopEndRadius: 0 };",
    // Builders and timers fed by tokens, or not by a literal.
    "const a = FadeIn.duration(motion.duration.fast).delay(0);",
    "const a = withDelay(0, x); const b = withDelay(delay, y);",
    "let L = 5; const a = withDelay(L, x);",
    "const a = withSpring(1, motion.spring.soft);",
    "const a = withSpring(1, { damping: spring.damping, reduceMotion: x });",
    "setTimeout(go, 250);",
    'import { x } from "react-native"; const W = 250; setTimeout(go, W);',
    'import { x } from "react-native-reanimated"; setTimeout(go, delay); setTimeout(go, 0);',
    "const POLL = 5000; const SETTLE_MS = timing.settle; const MS = ms(3); let X_MS = 1;",
    // A repeat count is not a design value.
    "const a = withRepeat(x, -1, true);",
    'import { Button } from "#app/ui";',
    'export { x } from "#app/ui";',
    'const a = "#app/ui";',
    'const a = "#"; const b = "#zzz"; const c = "#1234567890";',
    'const a = "rgbish";',
    "const a = { borderRadius: 0 };",
    'const a = <View testID="p-[13px]" />;',
    'const a = <View className="p-5" />;',
    "const a = arr[0]; const b = { lineHeight: undefined };",
    {
      code: 'const a = <View className="p-5 text-body bg-bg-cell md:p-5 dark:bg-bg-cell hover:p-5" />;',
      options: [ALLOWED],
    },
    { code: 'const a = <View className="web-only-class" />;' },
    {
      // Words cut by a `${...}` are fragments, not classes.
      code: "const a = <View className={`p-5 ${x} text-body gap-${n} m${y}`} />;",
      options: [ALLOWED],
    },
    {
      // The design package owns the values; the rule is not applied there.
      code: 'const a = { fontSize: 15, color: "#fff", className: "p-[3px]" };',
      filename: "packages/core/src/design/tokens.ts",
    },
    {
      code: 'const a = <View className="p-[3px]" />; const b = "#fff";',
      filename: "apps/app/src/ui/example.test.tsx",
    },
  ].map((c) =>
    typeof c === "string" ? { code: c, filename: APP_FILE } : { filename: APP_FILE, ...c },
  ),
});
