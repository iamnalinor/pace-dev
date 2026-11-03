/**
The answer schema's length limits, kept in one place (bug class 12): the model is shown the schema
without them (some endpoints refuse them, Gemini's OpenAI layer answers 400), and its answer is
clamped to them before the strict check, so a seventh option or an empty one costs that item,
not the whole answer. Nullable keys an action left out ("does not apply") are filled first
(`fillAbsent`, bug classes 85 and 95).
*/

const LENGTH_LIMITS: ReadonlySet<string> = new Set(["maxItems", "maxLength", "minLength"]);

type Node = {
  readonly type?: unknown;
  readonly required?: unknown;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly items?: unknown;
  readonly anyOf?: readonly unknown[];
  readonly maxItems?: unknown;
  readonly maxLength?: unknown;
  readonly minLength?: unknown;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nodeOf = (schema: unknown): Node => (isRecord(schema) ? schema : {});

const limitOf = (limit: unknown): number => (typeof limit === "number" ? limit : Infinity);

/** A JSON schema without the numeric length limits, everything else kept. */
export const lenientJsonSchema = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => lenientJsonSchema(item));
  }
  return isRecord(value)
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([key, item]) => !(typeof item === "number" && LENGTH_LIMITS.has(key)))
          .map(([key, item]) => [key, lenientJsonSchema(item)]),
      )
    : value;
};

const jsonType = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  return Array.isArray(value) ? "array" : typeof value;
};

/** The branch of an `anyOf` that fits the value's JSON type (integers count as numbers). */
const branchFor = (node: Node, value: unknown): Node => {
  const type = jsonType(value);
  const branch = (node.anyOf ?? [])
    .map((option) => nodeOf(option))
    .find((option) => {
      const wanted = option.type === "integer" ? "number" : option.type;
      return wanted === type;
    });
  return branch ?? node;
};

/** True when a string, or a string field of an object, is shorter than its schema allows. */
const isTooShort = (value: unknown, node: Node): boolean => {
  if (typeof value === "string") {
    return value.length < (typeof node.minLength === "number" ? node.minLength : 0);
  }
  return (
    isRecord(value) &&
    Object.entries(node.properties ?? {}).some(([key, field]) =>
      isTooShort(value[key], branchFor(nodeOf(field), value[key])),
    )
  );
};

const isNullable = (node: Node): boolean =>
  node.type === "null" ||
  (Array.isArray(node.type) && node.type.includes("null")) ||
  (node.anyOf ?? []).some((option) => nodeOf(option).type === "null");

const requiredOf = (node: Node): readonly string[] =>
  Array.isArray(node.required)
    ? node.required.filter((key): key is string => typeof key === "string")
    : [];

/**
The root lists whose absence says "nothing here" and nothing more: a model that has no question
leaves `questions` out (round 7 review 4). Never `actions`: an answer without it is no reading.
*/
const ROOT_EMPTY_WHEN_ABSENT: ReadonlySet<string> = new Set(["questions"]);

/** The root's required lists in `ROOT_EMPTY_WHEN_ABSENT` that `value` left out, as empty lists. */
const rootListsLeftOut = (
  value: Readonly<Record<string, unknown>>,
  node: Node,
): readonly (readonly [string, readonly never[]])[] =>
  requiredOf(node)
    .filter((key) => ROOT_EMPTY_WHEN_ABSENT.has(key) && !Object.hasOwn(value, key))
    .filter((key) => nodeOf(node.properties?.[key]).type === "array")
    .map((key) => [key, []] as const);

/**
`value` with every required key it left out that may be null set to null ("does not apply"),
below the root (bug class 85): a best-effort endpoint's model drops the keys it has nothing for,
though the schema asks for all of them. A list is never filled, at the root least of all: an
answer with no `actions` is no reading, not "nothing to do" (bug class 95); the one exception is
a root list in `ROOT_EMPTY_WHEN_ABSENT` (`questions`). A key that may not be null stays missing,
for the strict check to refuse.
*/
export const fillAbsent = (value: unknown, schema: unknown, isRoot = true): unknown => {
  const node = branchFor(nodeOf(schema), value);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => fillAbsent(item, node.items, false));
  }
  if (!isRecord(value)) {
    return value;
  }
  const properties = node.properties ?? {};
  const kept = Object.entries(value).map(([key, item]) => [
    key,
    Object.hasOwn(properties, key) ? fillAbsent(item, properties[key], false) : item,
  ]);
  const added = isRoot
    ? rootListsLeftOut(value, node)
    : requiredOf(node)
        .filter((key) => !Object.hasOwn(value, key) && isNullable(nodeOf(properties[key])))
        .map((key) => [key, null] as const);
  return Object.fromEntries([...kept, ...added]);
};

/** `value` cut to the schema's length limits: strings truncated, arrays sliced, empty items dropped. */
export const clampToJsonSchema = (value: unknown, schema: unknown): unknown => {
  const node = branchFor(nodeOf(schema), value);
  if (typeof value === "string") {
    return value.slice(0, limitOf(node.maxLength));
  }
  if (Array.isArray(value)) {
    const items = nodeOf(node.items);
    return value
      .map((item: unknown) => clampToJsonSchema(item, items))
      .filter((item) => !isTooShort(item, branchFor(items, item)))
      .slice(0, limitOf(node.maxItems));
  }
  if (!isRecord(value)) {
    return value;
  }
  const properties = node.properties ?? {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      Object.hasOwn(properties, key) ? clampToJsonSchema(item, properties[key]) : item,
    ]),
  );
};
