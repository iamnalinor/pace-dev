/**
ES2023/ES2024 built-ins the shared code uses that Hermes on Android lacks: without them the
APK throws `undefined is not a function` on its first sort. Each is defined only when
missing, so the browsers (and Node in the tests) keep their own.
*/

type KeyOf<T, K> = (item: T, index: number) => K;

function toSorted<T>(this: readonly T[], compare?: (a: T, b: T) => number): T[] {
  // eslint-disable-next-line unicorn/no-array-sort -- sorts the fresh copy, which is what toSorted is
  return [...this].sort(compare);
}

const objectGroupBy = <T, K extends PropertyKey>(
  items: Iterable<T>,
  keyOf: KeyOf<T, K>,
): Partial<Record<K, T[]>> => {
  const groups = Object.create(null) as Partial<Record<K, T[]>>;
  let index = 0;
  for (const item of items) {
    const key = keyOf(item, index);
    index += 1;
    const group = groups[key];
    if (group === undefined) {
      groups[key] = [item];
    } else {
      group.push(item);
    }
  }
  return groups;
};

const mapGroupBy = <T, K>(items: Iterable<T>, keyOf: KeyOf<T, K>): Map<K, T[]> => {
  const groups = new Map<K, T[]>();
  let index = 0;
  for (const item of items) {
    const key = keyOf(item, index);
    index += 1;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
};

const defineMissing = (target: object, name: string, value: unknown): void => {
  if (!Object.hasOwn(target, name)) {
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    });
  }
};

export const installPolyfills = (): void => {
  defineMissing(Array.prototype, "toSorted", toSorted);
  defineMissing(Object, "groupBy", objectGroupBy);
  defineMissing(Map, "groupBy", mapGroupBy);
};
