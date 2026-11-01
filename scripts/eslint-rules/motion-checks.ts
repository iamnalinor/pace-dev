import type { Rule } from "eslint";
import type {
  CallExpression,
  ImportDeclaration,
  Node,
  Property,
  VariableDeclaration,
  VariableDeclarator,
} from "estree";

import {
  calleeName,
  type Context,
  isNonZero,
  isNonZeroLiteralOrBinding,
  keyName,
  methodName,
} from "./ast.ts";

const DURATION_NAME = /(?:_MS|DURATION|DELAY)$/;
const SPRING_KEYS: ReadonlySet<string> = new Set(["damping", "mass", "stiffness"]);
const REANIMATED = "react-native-reanimated";

const reportDuration = (context: Context, node: Node, name: string): void => {
  context.report({ data: { name }, messageId: "rawDuration", node });
};

/** `{ duration: 200 }` anywhere: the options of withTiming, a breath config, a layout transition. */
export const checkDurationProperty = (context: Context, node: Property): void => {
  if (keyName(node) === "duration" && isNonZero(node.value)) {
    reportDuration(context, node, "duration");
  }
};

/**
`const BREATH_MS = 900;`: in a motion file (one importing reanimated) a named duration is still a
raw one; it belongs in the motion tokens. Poll/debounce/timeout intervals elsewhere are behaviour.
*/
const checkDurationDeclaration = (context: Context, node: VariableDeclarator): void => {
  const declaration = (node as Rule.Node).parent as VariableDeclaration;
  if (
    declaration.kind === "const" &&
    node.id.type === "Identifier" &&
    DURATION_NAME.test(node.id.name) &&
    isNonZero(node.init)
  ) {
    reportDuration(context, node, node.id.name);
  }
};

const checkSpring = (context: Context, call: CallExpression): void => {
  const options = call.arguments.filter((argument) => argument.type === "ObjectExpression");
  const properties = options.flatMap((option) => option.properties);
  for (const property of properties) {
    const name = property.type === "Property" ? keyName(property) : undefined;
    if (name !== undefined && SPRING_KEYS.has(name) && isNonZero((property as Property).value)) {
      reportDuration(context, property, `withSpring ${name}`);
    }
  }
};

type MotionCallChecks = {
  call: (node: CallExpression) => void;
  declarator: (node: VariableDeclarator) => void;
  importDeclaration: (node: ImportDeclaration) => void;
};

/** Call-shaped durations. A repeat count (`withRepeat(x, -1)`) is not a design value. */
export const createMotionCallChecks = (context: Context): MotionCallChecks => {
  let isUsesReanimated = false;
  return {
    // The same flag as setTimeout's: only files that animate with reanimated are motion files.
    declarator(node) {
      if (isUsesReanimated) {
        checkDurationDeclaration(context, node);
      }
    },
    call(node) {
      const callee = calleeName(node);
      const method = methodName(node);
      if (callee === "withDelay" && isNonZeroLiteralOrBinding(context, node.arguments[0])) {
        reportDuration(context, node, "withDelay");
      } else if (
        callee === "setTimeout" &&
        isUsesReanimated &&
        isNonZeroLiteralOrBinding(context, node.arguments[1])
      ) {
        reportDuration(context, node, "setTimeout");
      } else if (callee === "withSpring") {
        checkSpring(context, node);
      } else if ((method === "duration" || method === "delay") && isNonZero(node.arguments[0])) {
        reportDuration(context, node, `.${method}()`);
      }
    },
    // Imports come first in a module, so the flag is set before any call is visited.
    importDeclaration(node) {
      isUsesReanimated ||= node.source.value === REANIMATED;
    },
  };
};
