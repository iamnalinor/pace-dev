import type { Literal, Node, TemplateElement, TemplateLiteral } from "estree";

import type { Context } from "./ast.ts";

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
  // A comparison (`variant === "raised"`) holds a value, not a class: only `+` joins class text.
  if (
    node.type === "LogicalExpression" ||
    (node.type === "BinaryExpression" && node.operator === "+")
  ) {
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

/** Classes cut by a `${...}` are fragments, not classes: only whole words are checked. */
const isFragment = (piece: Piece, index: number, count: number): boolean =>
  (index === 0 && piece.openStart && !/^\s/.test(piece.text)) ||
  (index === count - 1 && piece.openEnd && !/\s$/.test(piece.text));

/**
What a check needs beside the node: the accepted classes (`undefined`: only arbitrary values are
reported) and the pieces already checked as a className, so the loose-string check does not report
them twice.
*/
export type ClassScope = {
  readonly allowed: ReadonlySet<string> | undefined;
  readonly seen: WeakSet<Literal | TemplateElement>;
};

const words = (piece: Piece): readonly string[] =>
  piece.text.split(/\s+/).filter((token) => token !== "");

const checkPiece = (context: Context, { allowed }: ClassScope, piece: Piece): void => {
  const tokens = words(piece);
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
};

export const checkClasses = (context: Context, scope: ClassScope, node: Node): void => {
  for (const piece of piecesOf(node)) {
    scope.seen.add(piece.node);
    checkPiece(context, scope, piece);
  }
};

/*
A string outside a className (a constant, a map value, a `cx()` argument) is read as a class list
when every whole word in it looks like a utility (lower case, no spaces inside) and at least one
word starts with a utility family's prefix (`bg-`, `p-`, `text-`, `rounded`, …) or is a bare
utility (`flex`, `absolute`, `border`) beside other words. Strings given to another JSX attribute
(`testID`, `accessibilityRole`) are never class lists. Ids (`day-entry`), keys (`nav.inbox`), file
names, words and style values (`flex-start`, `space-between`, `top`) are not class lists.
*/
const CLASS_WORD = /^[^\sA-Z"'`]+$/;
const FAMILIES: readonly string[] =
  `bg text border gap inset top right bottom left size p px py pt pr pb pl m mx my mt mr mb ml h w min-h min-w max-h max-w rounded flex items justify self font leading tracking opacity shadow scale overflow overscroll z`.split(
    " ",
  );
const hasFamily = (base: string): boolean => {
  const word = base.startsWith("-") ? base.slice(1) : base;
  return FAMILIES.some((family) => word.startsWith(`${family}-`));
};
const BARE_UTILITIES: ReadonlySet<string> = new Set([
  "absolute",
  "border",
  "flex",
  "hidden",
  "relative",
  "rounded",
  "tabular-nums",
  "underline",
  "uppercase",
]);
// Style values that share a prefix with a utility family.
const STYLE_VALUES: ReadonlySet<string> = new Set([
  "flex-end",
  "flex-start",
  "line-through",
  "text-bottom",
  "text-top",
]);

/** A family prefix always counts; a bare utility only beside other words (alone, `"absolute"` is a style value). */
const isUtility = (token: string, isAlone: boolean): boolean => {
  const base = baseClass(token);
  return !STYLE_VALUES.has(base) && (hasFamily(base) || (!isAlone && BARE_UTILITIES.has(base)));
};

const isClassList = (pieces: readonly Piece[]): boolean => {
  const whole = pieces.flatMap((piece) => {
    const tokens = words(piece);
    return tokens.filter((_, index) => !isFragment(piece, index, tokens.length));
  });
  return (
    whole.length > 0 &&
    whole.every((token) => CLASS_WORD.test(token)) &&
    whole.some((token) => isUtility(token, whole.length === 1))
  );
};

/** Checks a string or template that is not under a className but reads as a class list. */
export const checkLooseClasses = (
  context: Context,
  scope: ClassScope,
  node: Literal | TemplateLiteral,
): void => {
  const pieces = piecesOf(node);
  if (pieces.some((piece) => scope.seen.has(piece.node)) || !isClassList(pieces)) {
    return;
  }
  for (const piece of pieces) {
    checkPiece(context, scope, piece);
  }
};
