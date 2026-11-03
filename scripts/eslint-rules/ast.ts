import type { Rule, Scope } from "eslint";
import type { CallExpression, Node, Property, VariableDeclaration } from "estree";

export type Context = Rule.RuleContext;

/** A literal number, with an optional sign: `12`, `-0.2`. Anything computed is not a literal. */
export const numericValue = (node: Node | null | undefined): number | undefined => {
  if (node === null || node === undefined) {
    return undefined;
  }
  if (node.type === "Literal" && typeof node.value === "number") {
    return node.value;
  }
  return node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")
    ? numericValue(node.argument)
    : undefined;
};

/** A numeric literal other than 0 (`0` is "none", not a design value). */
export const isNonZero = (node: Node | null | undefined): boolean => {
  const value = numericValue(node);
  return value !== undefined && value !== 0;
};

export const keyName = (property: Property): string | undefined => {
  const { key } = property;
  if (!property.computed && key.type === "Identifier") {
    return key.name;
  }
  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
};

export const calleeName = (call: CallExpression): string | undefined =>
  call.callee.type === "Identifier" ? call.callee.name : undefined;

/** `X.duration(...)` -> `duration`. */
export const methodName = (call: CallExpression): string | undefined =>
  call.callee.type === "MemberExpression" &&
  !call.callee.computed &&
  call.callee.property.type === "Identifier"
    ? call.callee.property.name
    : undefined;

/** Is this identifier's declaration `const x = <number>`? */
const isConstNumber = (definition: Scope.Definition | undefined): boolean => {
  const declaration = definition?.node as Node | undefined;
  const statement = definition?.parent as null | undefined | VariableDeclaration;
  return (
    statement?.kind === "const" &&
    declaration?.type === "VariableDeclarator" &&
    declaration.id.type === "Identifier" &&
    isNonZero(declaration.init)
  );
};

/**
Is this a number literal, or an identifier whose declaration in the file is `const x = <number>`?
Resolved through the scope chain, only when asked (a handful of calls per file).
*/
export const isNonZeroLiteralOrBinding = (context: Context, node: Node | undefined): boolean => {
  if (node === undefined) {
    return false;
  }
  if (node.type !== "Identifier") {
    return isNonZero(node);
  }
  let scope: null | Scope.Scope = context.sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) {
      return isConstNumber(variable.defs[0]);
    }
    scope = scope.upper;
  }
  return false;
};
