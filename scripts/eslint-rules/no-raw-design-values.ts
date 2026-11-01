import type { Rule } from "eslint";
import type { Expression, Literal, Property } from "estree";

import { type Context, isNonZero, keyName, numericValue } from "./ast.ts";
import { checkClasses } from "./class-checks.ts";
import { isColorString, isNamedColorValue } from "./colors.ts";
import { checkDurationProperty, createMotionCallChecks } from "./motion-checks.ts";

/**
Drives raw design values out of the app: colours (hex, `rgb()`/`hsl()`, CSS names on colour keys),
radii, font metrics, durations (`duration:`, `.duration(n)`/`.delay(n)`, `withDelay`, timers beside
reanimated, `*_MS`/`*DURATION`/`*DELAY` constants, spring physics) and Tailwind arbitrary values
must come from the design tokens (`@pace/core` design package, the generated Tailwind scale).
Spec §9.3.

Message ids: rawColor, rawRadius, rawFontMetric, rawDuration, arbitraryClass, offScaleClass.
`offScaleClass` needs the generated class list (option `allowedClasses`); without it only the
arbitrary-value (`[...]`) and raw-literal checks run.

Known false-positive risk: any whole string that looks like a hex colour (`"#abc"`, `"#bad"`),
and a `*_MS` constant that is not an animation (a poll interval): rename it or lift it into the
tokens, as the rule asks.
*/
type Options = { allowedClasses?: readonly string[] };

const CLASS_PROP = /classname$/i;
// physical, logical (`borderStartStartRadius`) and mixed (`borderTopEndRadius`) corners
const RADIUS_KEY =
  /^border(?:(?:top|bottom)?(?:left|right|start|end)?|(?:start|end)(?:start|end))radius$/i;
const FONT_KEYS: ReadonlySet<string> = new Set(["fontSize", "letterSpacing", "lineHeight"]);
// The design package owns the raw values; tests and fakes assert on literals.
const DESIGN_PACKAGE = /(?:^|\/)packages\/core\/src\/design\//;
const TEST_FILE = /\.(?:test|fake)\.[cm]?[jt]sx?$/;

/** The slice of ESTree-JSX the rule reads (estree's types do not cover JSX). */
type JsxAttribute = {
  name: { name: string; type: string };
  value: Literal | null | { expression: Expression; type: "JSXExpressionContainer" };
};

/** Which raw-value message a numeric property is, if any. */
const rawValueId = (
  name: string,
  value: Property["value"],
): "rawFontMetric" | "rawRadius" | undefined => {
  if (RADIUS_KEY.test(name)) {
    return isNonZero(value) ? "rawRadius" : undefined;
  }
  return FONT_KEYS.has(name) && numericValue(value) !== undefined ? "rawFontMetric" : undefined;
};

const checkProperty = (
  context: Context,
  allowed: ReadonlySet<string> | undefined,
  node: Property,
): void => {
  const name = keyName(node);
  if (name === undefined) {
    return;
  }
  if (CLASS_PROP.test(name)) {
    checkClasses(context, allowed, node.value);
    return;
  }
  if (node.value.type === "Literal" && typeof node.value.value === "string") {
    if (isNamedColorValue(name, node.value.value)) {
      context.report({ data: { value: node.value.value }, messageId: "rawColor", node });
    }
    return;
  }
  checkDurationProperty(context, node);
  const messageId = rawValueId(name, node.value);
  if (messageId !== undefined) {
    context.report({ data: { name }, messageId, node });
  }
};

const checkJsxAttribute = (
  context: Context,
  allowed: ReadonlySet<string> | undefined,
  { name, value }: JsxAttribute,
): void => {
  if (value === null || name.type !== "JSXIdentifier") {
    return;
  }
  if (CLASS_PROP.test(name.name)) {
    checkClasses(
      context,
      allowed,
      value.type === "JSXExpressionContainer" ? value.expression : value,
    );
  } else if (
    value.type === "Literal" &&
    typeof value.value === "string" &&
    isNamedColorValue(name.name, value.value)
  ) {
    context.report({ data: { value: value.value }, messageId: "rawColor", node: value });
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

    const motion = createMotionCallChecks(context);

    return {
      CallExpression: motion.call,
      ImportDeclaration: motion.importDeclaration,
      JSXAttribute(node: Rule.Node) {
        checkJsxAttribute(context, allowed, node as unknown as JsxAttribute);
      },
      Literal(node) {
        if (typeof node.value === "string" && isColorString(node.value)) {
          context.report({ data: { value: node.value }, messageId: "rawColor", node });
        }
      },
      Property: (node) => {
        checkProperty(context, allowed, node);
      },
      VariableDeclarator: motion.declarator,
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
