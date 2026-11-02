import type { Literal, Node, TemplateElement } from "estree";

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

export const checkClasses = (
  context: Context,
  allowed: ReadonlySet<string> | undefined,
  node: Node,
): void => {
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
