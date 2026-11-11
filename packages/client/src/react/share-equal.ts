const isPlain = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const idOf = (item: unknown): string | undefined =>
  isPlain(item) && typeof item["id"] === "string" ? item["id"] : undefined;

/**
Rows are matched by their `id` when they have one, else by place: a row that left the list (a task
checked off) must not make every row after it a new object.
*/
const shareArray = (previous: readonly unknown[], next: readonly unknown[]): readonly unknown[] => {
  const byId = new Map<string, unknown>();
  for (const item of previous) {
    const id = idOf(item);
    if (id !== undefined) {
      byId.set(id, item);
    }
  }
  const shared = next.map((item, index) => {
    const id = idOf(item);
    return shareEqual(id === undefined ? previous[index] : byId.get(id), item);
  });
  const isSame =
    previous.length === next.length && shared.every((item, index) => item === previous[index]);
  return isSame ? previous : shared;
};

const shareRecord = (
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const keys = Object.keys(next);
  const shared: Record<string, unknown> = {};
  let isSame = keys.length === Object.keys(previous).length;
  for (const key of keys) {
    const value = shareEqual(previous[key], next[key]);
    shared[key] = value;
    isSame &&= Object.hasOwn(previous, key) && value === previous[key];
  }
  return isSame ? previous : shared;
};

/**
`next`, with every part that equals the same part of `previous` taken from `previous` (structural
sharing): a view-model computed again after one task changed keeps the objects of every other row,
so a memoized row is not rendered for a change that is not its own (bug-lessons 310). Plain
objects and arrays are compared by content; anything else (a `Set`, a `Map`, a class) by identity,
and is taken from `next` as it is.
*/
export const shareEqual = <T>(previous: unknown, next: T): T => {
  if (Object.is(previous, next)) {
    return next;
  }
  if (Array.isArray(previous) && Array.isArray(next)) {
    return shareArray(previous, next) as T;
  }
  if (isPlain(previous) && isPlain(next)) {
    return shareRecord(previous, next) as T;
  }
  return next;
};
