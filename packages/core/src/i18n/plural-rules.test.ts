import * as fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LANGUAGES, plural } from "./i18n.ts";
import { ordinalCategory, pluralCategory } from "./plural-rules.ts";

// Hermes on Android has no Intl.PluralRules; the rules are written out and must agree with it.
describe("pluralCategory", () => {
  it.each(LANGUAGES)("agrees with Intl.PluralRules in %s for whole counts", (language) => {
    const rules = new Intl.PluralRules(language);
    fc.assert(
      fc.property(fc.integer({ max: 1_000_000, min: 0 }), (count) => {
        expect(pluralCategory(language, count)).toBe(rules.select(count));
      }),
    );
    for (const count of [0, 1, 2, 4, 5, 11, 12, 14, 15, 21, 22, 25, 101, 111, 112]) {
      expect(pluralCategory(language, count)).toBe(rules.select(count));
    }
  });

  it.each(LANGUAGES)("agrees with Intl.PluralRules in %s for fractions", (language) => {
    const rules = new Intl.PluralRules(language);
    for (const count of [0.5, 1.5, 2.25, 21.5]) {
      expect(pluralCategory(language, count)).toBe(rules.select(count));
    }
  });
});

describe("ordinalCategory", () => {
  it.each(LANGUAGES)("agrees with the ordinal Intl.PluralRules in %s", (language) => {
    const rules = new Intl.PluralRules(language, { type: "ordinal" });
    fc.assert(
      fc.property(fc.integer({ max: 1_000_000, min: 0 }), (count) => {
        expect(ordinalCategory(language, count)).toBe(rules.select(count));
      }),
    );
    for (const count of [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31, 101, 111, 112, 113]) {
      expect(ordinalCategory(language, count)).toBe(rules.select(count));
    }
  });
});

describe("plural without Intl.PluralRules (Hermes)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still picks the Russian forms", () => {
    // Everything else of Intl stays (the count is formatted by NumberFormat); only PluralRules goes.
    vi.stubGlobal("Intl", Object.create(Intl, { PluralRules: { value: undefined } }));
    const forms = {
      few: "{count} задачи",
      many: "{count} задач",
      one: "{count} задача",
      other: "{count} задачи",
    };
    expect([1, 3, 5, 21].map((count) => plural("ru", count, forms))).toEqual([
      "1 задача",
      "3 задачи",
      "5 задач",
      "21 задача",
    ]);
  });
});
