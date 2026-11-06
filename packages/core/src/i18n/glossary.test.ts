import { describe, expect, it } from "vitest";

import { en } from "./en.ts";
import { ru } from "./ru.ts";

const catalogs = { en, ru } as const;

const values = (catalog: Readonly<Record<string, string>>): readonly string[] =>
  Object.values(catalog);

describe("the catalog's glossary (F-CPY-01/02/03/05)", () => {
  it("has none of the phrases the owner rejected", () => {
    for (const phrase of ["We changed a few things", "Settings → Devices", "Мы кое-что поменяли"]) {
      for (const catalog of Object.values(catalogs)) {
        expect(values(catalog).filter((value) => value.includes(phrase))).toEqual([]);
      }
    }
  });

  it("keeps the copy the owner agreed", () => {
    expect(en["update.message"]).toBe("A new version of Pace is ready.");
    expect(en["update.refresh"]).toBe("Refresh page");
    expect(ru["update.refresh"]).toBe("Обновить страницу");
    // The Calendar hint stays short and names no section by its old name.
    expect(en["devices.calendarHint"].length).toBeLessThanOrEqual(120);
  });

  it("uses one word per action in each language", () => {
    for (const catalog of Object.values(catalogs)) {
      expect(catalog["common.undo"]).not.toBe(catalog["common.cancel"]);
      expect(catalog["assistant.approved"]).not.toBe(catalog["task.done"]);
    }
    expect(ru["common.undo"]).not.toBe(ru["review.action.cancel"]);
    expect(ru["common.undo"]).not.toMatch(/^Отмен/u);
  });

  it("ends a session with one verb and signs in with one", () => {
    expect(values(en).filter((value) => /\bRevoke\b/u.test(value))).toEqual([]);
    expect(values(en).filter((value) => /\bLog in\b/u.test(value))).toEqual([]);
  });
});
