import { describe, expect, it } from "vitest";

import { ACTION_LIMITS } from "../actions/limits.ts";
import { ACTIVITY_LABEL_MAX } from "../events/payloads.ts";
import { LANGUAGES } from "../i18n/i18n.ts";
import { filler } from "./gallery-text.ts";
import { GALLERY_SETS } from "./gallery-types.ts";
import { galleryData } from "./worst-case.ts";

describe("filler", () => {
  it("is exactly as long as asked and never ends in a space", () => {
    expect(filler("ab cd ", 7)).toBe("ab cd a");
    expect(filler("ab cd ", 6)).toBe("ab cd.");
  });
});

describe.each(LANGUAGES)("galleryData in %s", (language) => {
  const worst = galleryData("worst", language);

  it("builds the same data every time, fresh", () => {
    for (const set of GALLERY_SETS) {
      expect(galleryData(set, language)).toEqual(galleryData(set, language));
      expect(galleryData(set, language)).not.toBe(galleryData(set, language));
      expect(galleryData(set, language).set).toBe(set);
      expect(galleryData(set, language).language).toBe(language);
    }
  });

  it("holds the worst case at the contract's limits", () => {
    expect(worst.tasks[0]?.title).toHaveLength(ACTION_LIMITS.title);
    expect(worst.tasks.some((task) => task.title.length === 1)).toBe(true);
    expect(worst.tasks.some((task) => /^https:\/\/\S+$/u.test(task.title))).toBe(true);
    expect(worst.tasks.some((task) => /^\p{Extended_Pictographic}/u.test(task.title))).toBe(true);
    expect(worst.tasks.some((task) => /\p{Script=Hebrew}/u.test(task.title))).toBe(true);
    expect(worst.projects).toHaveLength(12);
    expect(
      worst.projects.filter((project) => project.name.length >= 78).map((p) => p.name.length),
    ).toHaveLength(10);
    for (const project of worst.projects) {
      expect(project.name.length).toBeLessThanOrEqual(ACTION_LIMITS.projectName);
    }
    expect(worst.subtasks).toHaveLength(37);
    expect(worst.subtasks.every((subtask) => subtask.isSolved)).toBe(true);
    expect(Math.max(...worst.subtasks.map((subtask) => subtask.label.length))).toBe(
      ACTION_LIMITS.subtaskLabel,
    );
    expect(worst.inboxCount).toBeGreaterThan(99);
    expect(worst.running?.label).toHaveLength(ACTIVITY_LABEL_MAX);
    expect(worst.running?.minutes).toBe(23 * 60 + 59);
    expect(worst.durations).toContain(0);
    expect(worst.description).toHaveLength(4000);
    expect(worst.link?.length).toBeLessThanOrEqual(ACTION_LIMITS.link);
    expect((worst.ownerName ?? "").length).toBeLessThanOrEqual(64);
    expect(worst.signIn?.name.length).toBeLessThanOrEqual(120);
    expect(worst.signIn?.city.length).toBeLessThanOrEqual(80);
  });

  it("overlaps blocks in time and keeps every one inside its day", () => {
    const monday = worst.blocks.filter((block) => block.day === 0);
    const overlaps = monday.filter((block, index) =>
      monday.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          other.startMinute < block.startMinute + block.minutes &&
          block.startMinute < other.startMinute + other.minutes,
      ),
    );
    expect(overlaps.length).toBeGreaterThanOrEqual(3);
    for (const block of worst.blocks) {
      expect(block.startMinute + block.minutes).toBeLessThanOrEqual(24 * 60);
      expect(block.label.length).toBeLessThanOrEqual(ACTIVITY_LABEL_MAX);
    }
    expect(worst.blocks.some((block) => block.minutes === 23 * 60 + 59)).toBe(true);
  });

  it("covers every plural form of the language", () => {
    expect(galleryData("demo", language).pluralCounts).toEqual([1, 2, 5, 11, 21, 22, 25]);
    expect(worst.pluralCounts).toEqual([1, 2, 5, 11, 21, 22, 25]);
  });

  it("gives the empty set nothing and the one set exactly one of each", () => {
    const empty = galleryData("empty", language);
    expect([
      empty.projects.length,
      empty.tasks.length,
      empty.subtasks.length,
      empty.inboxCount,
      empty.blocks.length,
      empty.sessions.length,
    ]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([empty.running, empty.signIn, empty.ownerName]).toEqual([null, null, null]);
    const one = galleryData("one", language);
    expect([
      one.projects.length,
      one.tasks.length,
      one.subtasks.length,
      one.inboxCount,
      one.blocks.length,
      one.sessions.length,
    ]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("points every task at a project of its own set", () => {
    for (const set of GALLERY_SETS) {
      const data = galleryData(set, language);
      const ids = new Set(data.projects.map((project) => project.id));
      for (const task of data.tasks) {
        expect(task.projectId === null || ids.has(task.projectId)).toBe(true);
      }
    }
  });
});

describe("galleryData across languages", () => {
  it("writes the long texts in the language", () => {
    expect(galleryData("worst", "ru").tasks[0]?.title).toMatch(/\p{Script=Cyrillic}/u);
    expect(galleryData("worst", "en").tasks[0]?.title).not.toMatch(/\p{Script=Cyrillic}/u);
  });
});
