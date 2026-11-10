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
    // The Calendar hint, word for word (the owner's 4.13 copy): short, and no section by its old name.
    expect(en["devices.calendarHint"]).toBe(
      "Your own and accepted events go to Pace, so the web and the week show them. Turning it off deletes the copy.",
    );
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

  it("ends a session with one verb and signs in and out with one pair", () => {
    expect(values(en).filter((value) => /\bRevoke\b/u.test(value))).toEqual([]);
    // "Sign in" / "Sign out", never "Log in" / "Log out" as the verb ("logged in one tap" is time
    // being logged, and "login" a noun).
    expect(
      values(en).filter((value) => /\b(?:log|logging) (?:in|out)\b|\blogged out\b/iu.test(value)),
    ).toEqual([]);
    expect(en["settings.logout"]).toBe("Sign out");
    expect(en["login.title"]).toBe("Sign in to Pace");
  });

  it("names no choice of a picker after the picker itself (QA round 22 R22-22)", () => {
    for (const catalog of Object.values(catalogs)) {
      const entries = Object.entries(catalog);
      const pickers = new Set(
        entries.filter(([key]) => key.startsWith("time.button.")).map(([, v]) => v),
      );
      const choices = entries.filter(([key]) => key.startsWith("time.choice.")).map(([, v]) => v);
      expect(choices.filter((choice) => pickers.has(choice))).toEqual([]);
    }
    expect(ru["time.choice.nap"]).toBe("Дневной сон");
    // An action, not a status: the button closes the task with that outcome.
    expect(ru["close.confirm"]).toBe("Закрыть со статусом «{outcome}»");
  });
});
