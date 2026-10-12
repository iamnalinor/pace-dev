/* eslint-disable @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-unsafe-assignment -- the test takes builtins away as Hermes lacks them */
import { POLYFILLED } from "./polyfills.ts";

// The builtins the shared code calls that Hermes (React Native 0.86, Android) does not have:
// read from the name table of the libhermesvm.so a release APK ships.
const iteratorPrototype: Record<string, unknown> = Object.getPrototypeOf(
  Object.getPrototypeOf([][Symbol.iterator]()),
);
const owners: Readonly<Record<keyof typeof POLYFILLED, Record<string, unknown>>> = {
  arrayPrototype: Array.prototype as unknown as Record<string, unknown>,
  iteratorPrototype,
  map: Map as unknown as Record<string, unknown>,
  object: Object as unknown as Record<string, unknown>,
};
const HERMES_LACKS = Object.entries(POLYFILLED).flatMap(([owner, names]) =>
  names.map((name) => [owners[owner as keyof typeof POLYFILLED], name] as const),
);

const saved = HERMES_LACKS.map(([owner, name]) => Object.getOwnPropertyDescriptor(owner, name));

beforeAll(() => {
  for (const [owner, name] of HERMES_LACKS) {
    delete owner[name];
  }
  // Loaded again after the builtins are gone, as on the phone (Jest runs CommonJS: no import()).
  jest.isolateModules(() => {
    jest.requireActual("./polyfills.ts");
  });
});

afterAll(() => {
  for (const [index, [owner, name]] of HERMES_LACKS.entries()) {
    const descriptor = saved[index];
    if (descriptor !== undefined) {
      Object.defineProperty(owner, name, descriptor);
    }
  }
});

describe("polyfills for Hermes", () => {
  it("sorts a copy", () => {
    const numbers = [3, 1, 2];
    expect(numbers.toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(numbers).toEqual([3, 1, 2]);
  });

  it("groups into an object and into a map", () => {
    expect(Object.groupBy([1, 2, 3], (n) => (n % 2 === 0 ? "even" : "odd"))).toEqual({
      even: [2],
      odd: [1, 3],
    });
    expect([...Map.groupBy([1, 2, 3], (n) => n % 2)]).toEqual([
      [1, [1, 3]],
      [0, [2]],
    ]);
  });

  it("gives iterators their helpers, regex matches and map values included", () => {
    expect(
      "a1b2"
        .matchAll(/\d/gu)
        .map((match) => match[0])
        .toArray(),
    ).toEqual(["1", "2"]);
    expect(
      new Map([
        [1, "a"],
        [2, "b"],
      ])
        .values()
        .filter((value) => value === "b")
        .toArray(),
    ).toEqual(["b"]);
  });
});
/* eslint-enable @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-unsafe-assignment -- end of the test */
