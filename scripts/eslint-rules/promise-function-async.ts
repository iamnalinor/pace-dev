import type { Rule } from "eslint";

import { plugin } from "typescript-eslint";

const isRuleModule = (value: unknown): value is Rule.RuleModule =>
  typeof value === "object" && value !== null && "create" in value;

/** The upstream rule, read once; a missing rule fails loudly instead of linting less. */
const upstream = (): Rule.RuleModule => {
  // typescript-eslint's rule type is its own (and unresolved from the root project); at runtime
  // each entry is an ESLint rule module.
  const rules: unknown = Reflect.get(plugin, "rules");
  const rule: unknown =
    typeof rules === "object" && rules !== null
      ? Reflect.get(rules, "promise-function-async")
      : undefined;
  if (!isRuleModule(rule)) {
    throw new Error("typescript-eslint no longer ships promise-function-async");
  }
  return rule;
};

const base = upstream();

/**
`@typescript-eslint/promise-function-async` without its fix for a "hybrid" return (a promise or
something else, e.g. `() => inFlight` of `Promise | undefined`). Upstream reports that case and
still inserts `async`, and `return-await` then adds `await`: `async () => await inFlight` answers a
promise where it answered `undefined`, which changes what the function means (a drain loop over it
never ended: the `sync.hold` hang, pr48 follow-up A8). The report stays, and its message already
names the fix a person makes: an explicit return type.
*/
export const promiseFunctionAsync: Rule.RuleModule = {
  create(context) {
    const report = (descriptor: Rule.ReportDescriptor): void => {
      if ("messageId" in descriptor && descriptor.messageId === "missingAsyncHybridReturn") {
        const { fix: _fix, ...withoutFix } = descriptor;
        context.report(withoutFix);
        return;
      }
      context.report(descriptor);
    };
    return base.create(Object.create(context, { report: { value: report } }) as Rule.RuleContext);
  },
  ...(base.meta !== undefined && { meta: base.meta }),
};
