import type { Rule } from "eslint";
import type { ImportDeclaration } from "estree";

/**
Keeps the app's icons and line limits inside the kit (spec §4.1.1, §4.1.2 rule 9):

- `rawIcon`: an import from `lucide-react-native` outside `ui/icon.tsx`. The kit's `Icon` draws
  every icon at one of three sizes with the one stroke (F-CMP-21: 7 sizes and 6 strokes before).
- `rawLineLimit`: `numberOfLines` on React Native's own `Text` outside `ui/text.tsx` (+ `.web`).
  A line limit on a text that cannot shrink never ellipsizes (bug-lessons 109, F-DAT-02); the kit's
  `Text` yields by construction and takes a `policy` instead.

Tests and fakes are left alone: they draw what they assert on.
*/
const ICON_KIT = /(?:^|\/)apps\/app\/src\/ui\/icon\.tsx$/;
const TEXT_KIT = /(?:^|\/)apps\/app\/src\/ui\/text(?:\.web)?\.tsx$/;
const TEST_FILE = /\.(?:test|fake)\.[cm]?[jt]sx?$/;

/** The slice of ESTree-JSX the rule reads (estree's types do not cover JSX). */
type JsxAttribute = {
  readonly name: { readonly name: unknown; readonly type: string };
  readonly parent: { readonly name: { readonly name?: unknown; readonly type: string } };
};

/** The local names React Native's `Text` is imported under in this file. */
const nativeTextNames = (node: ImportDeclaration): readonly string[] =>
  node.specifiers
    .filter(
      (specifier) =>
        specifier.type === "ImportSpecifier" &&
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === "Text",
    )
    .map((specifier) => specifier.local.name);

export const kitPrimitives: Rule.RuleModule = {
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (TEST_FILE.test(filename)) {
      return {};
    }
    const isIconKit = ICON_KIT.test(filename);
    const isTextKit = TEXT_KIT.test(filename);
    const textNames = new Set<string>();
    return {
      ImportDeclaration(node) {
        if (!isIconKit && node.source.value === "lucide-react-native") {
          context.report({ messageId: "rawIcon", node });
        }
        if (node.source.value === "react-native") {
          for (const name of nativeTextNames(node)) {
            textNames.add(name);
          }
        }
      },
      "JSXAttribute[name.name='numberOfLines']"(node: Rule.Node) {
        const { parent } = node as unknown as JsxAttribute;
        if (
          !isTextKit &&
          parent.name.type === "JSXIdentifier" &&
          typeof parent.name.name === "string" &&
          textNames.has(parent.name.name)
        ) {
          context.report({ messageId: "rawLineLimit", node });
        }
      },
    };
  },
  meta: {
    docs: { description: "Icons and line limits come from the kit (Icon, Text)." },
    messages: {
      rawIcon:
        "An icon from lucide directly has its own size and stroke: use Icon from #app/ui/icon (add the glyph to its list if it is new).",
      rawLineLimit:
        '`numberOfLines` on React Native\'s Text never ellipsizes in a row that cannot shrink: use Text from #app/ui/text with policy="truncate" or "clamp".',
    },
    schema: [],
    type: "problem",
  },
};
