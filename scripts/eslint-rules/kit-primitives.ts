import type { Rule } from "eslint";
import type { ImportDeclaration, Node } from "estree";

/**
Keeps the app's icons and line limits inside the kit (spec §4.1.1, §4.1.2 rule 9):

- `rawIcon`: lucide reached outside `ui/icon.tsx`: an import, a re-export (`export … from`), a
  deep path (`lucide-react-native/dist/…`) or a dynamic `import()`. The kit's `Icon` draws every
  icon at one of three sizes with the one stroke (F-CMP-21: 7 sizes and 6 strokes before).
- `rawLineLimit`: `numberOfLines` on React Native's own `Text` outside `ui/text.tsx` (+ `.web`),
  imported by name (aliased too) or reached through a namespace or default import (`RN.Text`). A
  line limit on a text that cannot shrink never ellipsizes (bug-lessons 109, F-DAT-02); the kit's
  `Text` yields by construction and takes a `policy` instead.

Tests and fakes are left alone: they draw what they assert on.
*/
const ICON_KIT = /(?:^|\/)apps\/app\/src\/ui\/icon\.tsx$/;
const TEXT_KIT = /(?:^|\/)apps\/app\/src\/ui\/text(?:\.web)?\.tsx$/;
const TEST_FILE = /\.(?:test|fake)\.[cm]?[jt]sx?$/;
const LUCIDE = "lucide-react-native";

/** The package itself or a path inside it, not a package whose name merely starts the same. */
const isLucide = (source: unknown): boolean =>
  typeof source === "string" && (source === LUCIDE || source.startsWith(`${LUCIDE}/`));

/** The slice of ESTree-JSX the rule reads (estree's types do not cover JSX). */
type JsxName =
  | { readonly name: string; readonly type: "JSXIdentifier" }
  | {
      readonly object: JsxName;
      readonly property: { readonly name: string };
      readonly type: "JSXMemberExpression";
    }
  | { readonly type: "JSXNamespacedName" };

type JsxAttribute = { readonly parent: { readonly name: JsxName } };

/** What this file calls React Native's `Text`: named imports, and namespaces it reaches it through. */
type TextNames = { readonly names: Set<string>; readonly namespaces: Set<string> };

const collect = (node: ImportDeclaration, into: TextNames): void => {
  for (const specifier of node.specifiers) {
    if (specifier.type === "ImportSpecifier") {
      if (specifier.imported.type === "Identifier" && specifier.imported.name === "Text") {
        into.names.add(specifier.local.name);
      }
    } else {
      into.namespaces.add(specifier.local.name);
    }
  }
};

const isNativeText = (name: JsxName, { names, namespaces }: TextNames): boolean => {
  return name.type === "JSXIdentifier"
    ? names.has(name.name)
    : name.type === "JSXMemberExpression" &&
        name.property.name === "Text" &&
        name.object.type === "JSXIdentifier" &&
        namespaces.has(name.object.name);
};

export const kitPrimitives: Rule.RuleModule = {
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (TEST_FILE.test(filename)) {
      return {};
    }
    const isIconKit = ICON_KIT.test(filename);
    const isTextKit = TEXT_KIT.test(filename);
    const text: TextNames = { names: new Set(), namespaces: new Set() };
    const reportSource = (node: Node, source: unknown): void => {
      if (!isIconKit && isLucide(source)) {
        context.report({ messageId: "rawIcon", node });
      }
    };
    return {
      ExportAllDeclaration(node) {
        reportSource(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        reportSource(node, node.source?.value);
      },
      ImportDeclaration(node) {
        reportSource(node, node.source.value);
        if (node.source.value === "react-native") {
          collect(node, text);
        }
      },
      ImportExpression(node) {
        reportSource(node, node.source.type === "Literal" ? node.source.value : undefined);
      },
      "JSXAttribute[name.name='numberOfLines']"(node: Rule.Node) {
        const { parent } = node as unknown as JsxAttribute;
        if (!isTextKit && isNativeText(parent.name, text)) {
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
