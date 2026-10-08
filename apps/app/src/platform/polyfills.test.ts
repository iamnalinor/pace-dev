import { installPolyfills } from "./polyfills.ts";

/** What Hermes on Android lacks; the tests run in Node, which has them all. */
const MISSING_ON_HERMES = [
  [Array.prototype, "toSorted"],
  [Object, "groupBy"],
  [Map, "groupBy"],
] as const;

const natives = MISSING_ON_HERMES.map(([target, name]) =>
  Object.getOwnPropertyDescriptor(target, name),
);

const restoreNatives = (): void => {
  for (const [index, [target, name]] of MISSING_ON_HERMES.entries()) {
    const native = natives[index];
    if (native !== undefined) {
      Object.defineProperty(target, name, native);
    }
  }
};

describe("installPolyfills on a runtime without them", () => {
  beforeEach(() => {
    for (const [target, name] of MISSING_ON_HERMES) {
      Reflect.deleteProperty(target, name);
    }
    installPolyfills();
  });

  afterEach(restoreNatives);

  it("defines each built-in as a non-enumerable method", () => {
    for (const [target, name] of MISSING_ON_HERMES) {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      expect(typeof descriptor?.value).toBe("function");
      expect(descriptor?.enumerable).toBe(false);
    }
    expect(Object.keys([3, 1])).toStrictEqual(["0", "1"]);
  });

  it("toSorted returns a sorted copy and leaves the array alone", () => {
    const numbers = [3, 1, 10, 2];
    expect(numbers.toSorted((a, b) => a - b)).toStrictEqual([1, 2, 3, 10]);
    expect(numbers).toStrictEqual([3, 1, 10, 2]);
  });

  it("Object.groupBy groups in order into a null-prototype object", () => {
    const groups = Object.groupBy(["apple", "avocado", "banana"], (word, index) =>
      index === 2 ? "toString" : (word[0] ?? ""),
    );
    expect(Object.getPrototypeOf(groups)).toBeNull();
    expect({ ...groups }).toStrictEqual({ a: ["apple", "avocado"], toString: ["banana"] });
  });

  it("Map.groupBy keeps key identity and order", () => {
    const work = { id: "work" };
    const rest = { id: "rest" };
    const groups = Map.groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? work : rest));
    expect([...groups]).toStrictEqual([
      [rest, [1, 3]],
      [work, [2, 4]],
    ]);
  });
});

describe("installPolyfills on a runtime that has them", () => {
  afterEach(restoreNatives);

  it("keeps the built-ins", () => {
    installPolyfills();
    for (const [index, [target, name]] of MISSING_ON_HERMES.entries()) {
      expect(Object.getOwnPropertyDescriptor(target, name)).toStrictEqual(natives[index]);
    }
  });
});
