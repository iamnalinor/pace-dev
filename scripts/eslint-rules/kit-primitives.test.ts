// The root workspace has no vitest; Bun's runner exposes the same describe/it API.
import { describe, expect, it } from "bun:test";
import { RuleTester } from "eslint";
import { parser } from "typescript-eslint";

import { plugin } from "./index.ts";
import { kitPrimitives } from "./kit-primitives.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

describe("kit-primitives", () => {
  it("is registered in the pace plugin", () => {
    expect(plugin.rules["kit-primitives"]).toBe(kitPrimitives);
  });
});

const tester = new RuleTester({
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const SCREEN = "apps/app/src/features/day/day-screen.tsx";

tester.run("kit-primitives", kitPrimitives, {
  invalid: [
    {
      code: 'import { Clock } from "lucide-react-native";',
      errors: [{ messageId: "rawIcon" }],
      filename: SCREEN,
    },
    {
      code: 'import type { LucideIcon } from "lucide-react-native";',
      errors: [{ messageId: "rawIcon" }],
      filename: "apps/app/src/ui/button.tsx",
    },
    {
      code: 'import { Text } from "react-native";\nconst a = <Text numberOfLines={1}>x</Text>;',
      errors: [{ messageId: "rawLineLimit" }],
      filename: SCREEN,
    },
    {
      code: 'import { Text as RNText } from "react-native";\nconst a = <RNText numberOfLines={2}>x</RNText>;',
      errors: [{ messageId: "rawLineLimit" }],
      filename: "apps/app/src/ui/sidebar.tsx",
    },
    // Every way past the kit: a re-export, a deep import, a namespace, a dynamic import.
    {
      code: 'export { Clock } from "lucide-react-native";',
      errors: [{ messageId: "rawIcon" }],
      filename: SCREEN,
    },
    {
      code: 'export * from "lucide-react-native";',
      errors: [{ messageId: "rawIcon" }],
      filename: SCREEN,
    },
    {
      code: 'import Clock from "lucide-react-native/dist/esm/icons/clock";',
      errors: [{ messageId: "rawIcon" }],
      filename: SCREEN,
    },
    {
      code: 'const icons = import("lucide-react-native");',
      errors: [{ messageId: "rawIcon" }],
      filename: SCREEN,
    },
    {
      code: 'import * as RN from "react-native";\nconst a = <RN.Text numberOfLines={1}>x</RN.Text>;',
      errors: [{ messageId: "rawLineLimit" }],
      filename: SCREEN,
    },
    {
      code: 'import RN from "react-native";\nconst a = <RN.Text numberOfLines={1}>x</RN.Text>;',
      errors: [{ messageId: "rawLineLimit" }],
      filename: SCREEN,
    },
  ],
  valid: [
    // A package that only starts with the same letters is another package.
    { code: 'import { x } from "lucide-react-native-extra";', filename: SCREEN },
    {
      code: 'import * as RN from "react-native";\nconst a = <RN.TextInput numberOfLines={2} />;',
      filename: SCREEN,
    },
    // The kit's own files are where lucide and the line limit live.
    { code: 'import { Clock } from "lucide-react-native";', filename: "apps/app/src/ui/icon.tsx" },
    {
      code: 'import { Text } from "react-native";\nconst a = <Text numberOfLines={1}>x</Text>;',
      filename: "apps/app/src/ui/text.tsx",
    },
    {
      code: 'import { Text } from "react-native";\nconst a = <Text numberOfLines={1}>x</Text>;',
      filename: "apps/app/src/ui/text.web.tsx",
    },
    // Tests may draw what they assert on.
    {
      code: 'import { Clock } from "lucide-react-native";',
      filename: "apps/app/src/ui/icon.test.tsx",
    },
    // The kit's Text takes `policy`; a TextInput's line count is not a text's limit.
    {
      code: 'import { Text } from "#app/ui/text.tsx";\nconst a = <Text numberOfLines={1}>x</Text>;',
      filename: SCREEN,
    },
    {
      code: 'import { TextInput } from "react-native";\nconst a = <TextInput multiline numberOfLines={4} />;',
      filename: SCREEN,
    },
    { code: 'import { Text } from "react-native";\nconst a = <Text>x</Text>;', filename: SCREEN },
  ],
});
