import type { Rule } from "eslint";
import type { CallExpression, Expression, Literal, Node, Property, TemplateElement } from "estree";

/**
Drives raw design values out of the app: colours, radii, font metrics, durations and
Tailwind arbitrary values must come from the design tokens (`@pace/core` design package,
the generated Tailwind scale). Spec §9.3.

Message ids: rawColor, rawRadius, rawFontMetric, rawDuration, arbitraryClass, offScaleClass.
`offScaleClass` needs the generated class list (option `allowedClasses`); without it only the
arbitrary-value (`[...]`) and raw-literal checks run.
*/
type Options = { allowedClasses?: readonly string[] };

const COLOR = /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\()/i;
const HEX = /^#[\da-f]{3,8}$/i;
const CLASS_PROP = /classname$/i;
const RADIUS_KEY = /^border(?:top|bottom)?(?:left|right|start|end)?radius$/i;
const FONT_KEYS: ReadonlySet<string> = new Set(["fontSize", "letterSpacing", "lineHeight"]);
// The design package owns the raw values; tests and fakes assert on literals.
const DESIGN_PACKAGE = /(?:^|\/)packages\/core\/src\/design\//;
const TEST_FILE = /\.(?:test|fake)\.[cm]?[jt]sx?$/;

/** The slice of ESTree-JSX the rule reads (estree's types do not cover JSX). */
type JsxAttribute = {
  name: { name: string; type: string };
  value: Literal | null | { expression: Expression; type: "JSXExpressionContainer" };
};

const isColor = (value: string): boolean =>
  COLOR.test(value) && (!value.startsWith("#") || HEX.test(value));

/** The string pieces of a class expression: literals, template quasis, branches, call arguments. */
type Piece = {
  node: Literal | TemplateElement;
  text: string;
  /** The text continues into a `${...}`, so its first/last word may be a fragment of a class. */
  openEnd: boolean;
  openStart: boolean;
};

const childNodes = (node: Node): readonly (Node | null)[] => {
  if (node.type === "ConditionalExpression") {
    return [node.consequent, node.alternate];
  }
  if (node.type === "LogicalExpression" || node.type === "BinaryExpression") {
    return [node.left, node.right];
  }
  if (node.type === "CallExpression") {
    return node.arguments;
  }
  if (node.type === "ArrayExpression") {
    return node.elements;
  }
  return node.type === "SpreadElement" ? [node.argument] : [];
};

const piecesOf = (node: Node | null): readonly Piece[] => {
  if (node === null) {
    return [];
  }
  if (node.type === "Literal") {
    return typeof node.value === "string"
      ? [{ node, openEnd: false, openStart: false, text: node.value }]
      : [];
  }
  if (node.type === "TemplateLiteral") {
    const last = node.quasis.length - 1;
    return node.quasis.map((quasi, index) => ({
      node: quasi,
      openEnd: index < last,
      openStart: index > 0,
      text: quasi.value.cooked ?? quasi.value.raw,
    }));
  }
  return childNodes(node).flatMap((child) => piecesOf(child));
};

/** `p-[13px]`, `data-[state=open]:flex`: a non-empty bracket pair inside one class. */
const isArbitrary = (token: string): boolean => {
  const open = token.indexOf("[");
  return open !== -1 && token.includes("]", open + 2);
};

/** Drops variant prefixes (`md:`, `dark:`, `hover:`) and the important marker. */
const baseClass = (token: string): string => {
  const base = token.slice(token.lastIndexOf(":") + 1);
  return base.startsWith("!") ? base.slice(1) : base;
};

const numericValue = (node: Node | null): number | undefined => {
  if (node === null) {
    return undefined;
  }
  if (node.type === "Literal" && typeof node.value === "number") {
    return node.value;
  }
  return node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")
    ? numericValue(node.argument)
    : undefined;
};

const isNonZero = (node: Node): boolean => {
  const value = numericValue(node);
  return value !== undefined && value !== 0;
};

const keyName = (property: Property): string | undefined => {
  const { key } = property;
  if (!property.computed && key.type === "Identifier") {
    return key.name;
  }
  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
};

const calleeName = (call: CallExpression): string | undefined =>
  call.callee.type === "Identifier" ? call.callee.name : undefined;

type Context = Rule.RuleContext;

/** Classes cut by a `${...}` are fragments, not classes: only whole words are checked. */
const isFragment = (piece: Piece, index: number, count: number): boolean =>
  (index === 0 && piece.openStart && !/^\s/.test(piece.text)) ||
  (index === count - 1 && piece.openEnd && !/\s$/.test(piece.text));

const checkClasses = (context: Context, allowed: ReadonlySet<string> | undefined, node: Node) => {
  for (const piece of piecesOf(node)) {
    const tokens = piece.text.split(/\s+/).filter((token) => token !== "");
    for (const [index, token] of tokens.entries()) {
      if (isArbitrary(token)) {
        context.report({ data: { name: token }, messageId: "arbitraryClass", node: piece.node });
      } else if (
        allowed !== undefined &&
        !allowed.has(baseClass(token)) &&
        !isFragment(piece, index, tokens.length)
      ) {
        context.report({ data: { name: token }, messageId: "offScaleClass", node: piece.node });
      }
    }
  }
};

type RawValueId = "rawDuration" | "rawFontMetric" | "rawRadius";

/** Which raw-value message a numeric property is, if any. */
const rawValueId = (name: string, value: Node): RawValueId | undefined => {
  if (RADIUS_KEY.test(name)) {
    return isNonZero(value) ? "rawRadius" : undefined;
  }
  if (name === "duration") {
    return isNonZero(value) ? "rawDuration" : undefined;
  }
  return FONT_KEYS.has(name) && numericValue(value) !== undefined ? "rawFontMetric" : undefined;
};

const checkProperty = (
  context: Context,
  allowed: ReadonlySet<string> | undefined,
  node: Property,
) => {
  const name = keyName(node);
  if (name === undefined) {
    return;
  }
  if (CLASS_PROP.test(name)) {
    checkClasses(context, allowed, node.value);
    return;
  }
  const messageId = rawValueId(name, node.value);
  if (messageId !== undefined) {
    context.report({ data: { name }, messageId, node });
  }
};

// withTiming/withSpring/withRepeat carry their duration in an options object, which
// checkProperty sees; a repeat count is not a design value.
const checkDelayCall = (context: Context, node: CallExpression) => {
  if (calleeName(node) === "withDelay" && numericValue(node.arguments[0] ?? null) !== undefined) {
    context.report({ data: { name: "withDelay" }, messageId: "rawDuration", node });
  }
};

export const noRawDesignValues: Rule.RuleModule = {
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (DESIGN_PACKAGE.test(filename) || TEST_FILE.test(filename)) {
      return {};
    }
    const [options] = context.options as [Options | undefined];
    const classes = options?.allowedClasses ?? [];
    const allowed = classes.length > 0 ? new Set(classes) : undefined;

    return {
      CallExpression: (node) => {
        checkDelayCall(context, node);
      },
      JSXAttribute(node: Rule.Node) {
        const { name, value } = node as unknown as JsxAttribute;
        if (value !== null && name.type === "JSXIdentifier" && CLASS_PROP.test(name.name)) {
          checkClasses(
            context,
            allowed,
            value.type === "JSXExpressionContainer" ? value.expression : value,
          );
        }
      },
      Literal(node) {
        if (typeof node.value === "string" && isColor(node.value)) {
          context.report({ data: { value: node.value }, messageId: "rawColor", node });
        }
      },
      Property: (node) => {
        checkProperty(context, allowed, node);
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow raw colours, radii, font metrics, durations and arbitrary Tailwind values",
    },
    messages: {
      arbitraryClass:
        "Arbitrary Tailwind value `{{name}}`: use a design token class from the scale.",
      offScaleClass: "`{{name}}` is not in the generated design scale: use a token class.",
      rawColor: "Raw colour `{{value}}`: use a colour token (`useTheme()` or a token class).",
      rawDuration: "Raw duration in `{{name}}`: use a `motion` token from `@pace/core`.",
      rawFontMetric: "Raw `{{name}}`: use a `type` role token (a `text-*` class or `typeStyle`).",
      rawRadius: "Raw `{{name}}`: use a `radius` token.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: { allowedClasses: { items: { type: "string" }, type: "array" } },
        type: "object",
      },
    ],
    type: "suggestion",
  },
};
