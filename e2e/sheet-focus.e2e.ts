import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";
import path from "node:path";

import { ru } from "./support/catalog.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { type LivedIn, seedLivedIn } from "./support/seed.ts";

/**
Every sheet of the app takes the keyboard to its first field (QA 18 M1), keeps Shift+Tab inside
(QA 19 L1), keeps a screen reader moving onto the dim there (round 6 M4) and closes on Escape. The
sheets come from the app's registry (`apps/app/src/ui/sheet-names.ts`, read here: e2e may not
import from the app), and the test fails when a registered sheet has no opener below: a new
sheet is covered the day it is named (bug-lessons class 90; the first-sync guard came back three
rounds running because its routes were a hand list).
*/

const REGISTRY = path.resolve(import.meta.dirname, "../apps/app/src/ui/sheet-names.ts");

/** The names in the registry's `SHEET_NAMES` array. */
const registeredSheets = (): readonly string[] => {
  const source = readFileSync(REGISTRY, "utf8");
  const list = /SHEET_NAMES = \[([^\]]*)\]/u.exec(source)?.[1] ?? "";
  return list
    .matchAll(/"([^"]+)"/gu)
    .map((match) => match[1] ?? "")
    .toArray();
};

// A dialog has a cross, and so has a phone's sheet on the web (spec §4.2.21: a phone's browser
// has no Back to rely on); Android's sheet has none (its handle, the dim and Back close it).
const SIZES = [
  { closeStops: 1, height: 844, name: "phone", width: 390 },
  { closeStops: 1, height: 900, name: "desktop", width: 1280 },
] as const;

type Size = (typeof SIZES)[number]["name"];

const SURFACE = '[data-pace-surface="sheet"]';
const CLOSE = ru["common.close"];

/** The account's language is Russian: a control by its Russian name, placeholders matching anything. */
const named = (key: keyof typeof ru): RegExp =>
  // eslint-disable-next-line security/detect-non-literal-regexp -- the catalog's own text, escaped
  new RegExp(
    `^${ru[key]
      .split(/(\{\w+\})/u)
      .map((part) =>
        /^\{\w+\}$/u.test(part) ? ".*" : part.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`),
      )
      .join("")}$`,
    "u",
  );

const DAY_PICK_TEXT = ru["day.pick"].replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
// eslint-disable-next-line security/detect-non-literal-regexp -- the catalog's own text, escaped
const dayPick = new RegExp(`${DAY_PICK_TEXT}$`, "u");

type Opener = {
  readonly sheet: string;
  /** What opens it, for the report (one sheet may have several ways in). */
  readonly via: string;
  /** Where it exists: the week's details are a pane on a computer, a sheet on a phone. */
  readonly sizes?: readonly Size[];
  /** The field the keyboard must land on, where the sheet names one. */
  readonly field?: string;
  readonly open: (page: Page, seeded: LivedIn) => Promise<void>;
};

/** One of the time bar's four fixed tiles on Now (they never fold; only the typed field does). */
const timeBarButton = async (page: Page, key: keyof typeof ru): Promise<void> => {
  await page.goto("/");
  const bar = page.getByRole("region", { name: ru["time.bar"] });
  await bar.getByRole("button", { exact: true, name: ru[key] }).click();
};

/** Every way into every sheet the test knows; the registry must not hold one it lacks. */
const OPENERS: readonly Opener[] = [
  ...(
    ["time.button.calendar", "time.button.task", "time.button.chores", "time.button.rest"] as const
  ).map((key) => ({
    open: async (page: Page) => {
      await timeBarButton(page, key);
    },
    // A computer's pickers are popovers under their tile, not sheets.
    sheet: "time-choices",
    sizes: ["phone"] as const,
    via: `the time bar's ${key}`,
  })),
  {
    field: ru["edit.taskTitle"],
    open: async (page, seeded) => {
      await page.goto(`/task/${seeded.openTaskId}`);
      await page.getByRole("button", { name: named("task.edit") }).click();
    },
    sheet: "task-edit",
    via: "the task's Edit",
  },
  {
    open: async (page, seeded) => {
      await page.goto(`/task/${seeded.openTaskId}`);
      await page.getByRole("button", { name: named("task.menu") }).click();
    },
    // A popover under the button on a computer.
    sheet: "task-menu",
    sizes: ["phone"],
    via: "the task's ⋯ menu",
  },
  {
    open: async (page, seeded) => {
      await page.goto(`/task/${seeded.openTaskId}`);
      await page.getByRole("button", { name: named("task.doneOther") }).click();
    },
    sheet: "close",
    via: "the task's other time or outcome",
  },
  {
    open: async (page, seeded) => {
      await page.goto(`/task/${seeded.openTaskId}`);
      await page.getByRole("button", { name: named("task.changeProject") }).click();
    },
    sheet: "move-to-project",
    via: "the task header's project",
  },
  {
    field: ru["day.what"],
    open: async (page) => {
      await page.goto("/day");
      await page.getByRole("button", { name: named("day.logPast") }).click();
    },
    sheet: "activity",
    // A computer edits it in the inspector beside the day (Task 4.4), not in a sheet.
    sizes: ["phone"],
    via: "Day's Log past activity",
  },
  {
    open: async (page) => {
      await page.goto("/day");
      // The date's button is named "<the day>. <Pick a day>".
      await page.getByRole("button", { name: dayPick }).click();
    },
    // A popover under the date on a computer.
    sheet: "day-picker",
    sizes: ["phone"] as const,
    via: "Day's date",
  },
  {
    open: async (page) => {
      await page.goto("/week");
      await page
        // A block is named "<day>, <from>–<to>, <name>" (F-A11Y-09).
        .getByRole("button", { name: /, \d{2}:\d{2}–\d{2}:\d{2}, /u })
        .first()
        .click();
    },
    sheet: "week-pick",
    sizes: ["phone"],
    via: "a block on Week",
  },
  {
    open: async (page) => {
      // The lived-in account has nothing to sort: one line goes to the Inbox first.
      await page.goto("/");
      const line = page.getByRole("textbox", { name: ru["composer.label"] });
      await line.pressSequentially("Спросить про счёт");
      await page.getByRole("button", { name: ru["composer.toInbox"] }).click();
      await expect(line).toHaveValue("");
      await page.goto("/inbox");
      await page.getByTestId("inbox-capture").first().click();
    },
    sheet: "inbox-detail",
    sizes: ["phone"],
    via: "a capture on the Inbox",
  },
  {
    open: async (page) => {
      await page.goto("/history");
      await page.getByRole("button", { exact: true, name: ru["common.undo"] }).first().click();
    },
    sheet: "history-undo",
    via: "History's Undo",
  },
  {
    open: async (page) => {
      await page.goto("/settings");
      await page.getByRole("button", { name: named("devices.add") }).click();
    },
    sheet: "add-computer",
    via: "Settings' Add a computer",
  },
  {
    open: async (page) => {
      await page.goto("/settings");
      await page.getByRole("button", { name: named("connectAi.open") }).click();
    },
    sheet: "connect-ai",
    via: "Settings' Connect an AI app",
  },
];

/** Where the keyboard is: inside the open sheet or not, on a field or not, and its name. */
const focus = async (page: Page) =>
  await page.locator(SURFACE).evaluate((surface) => {
    const active = surface.ownerDocument.activeElement;
    return {
      hasField: surface.querySelector("input:not([type=hidden]), textarea") !== null,
      isField: active?.matches("input, textarea") ?? false,
      isInSheet: active !== null && surface.contains(active),
      name: active?.getAttribute("aria-label") ?? active?.getAttribute("placeholder") ?? "",
    };
  });

/** The Close stops Tab reaches in the open dialog (the dim is not one; the cross may be). */
const closeTabStops = async (page: Page): Promise<number> =>
  await page
    .locator(`[role="dialog"] [aria-label="${CLOSE}"]`)
    .evaluateAll(
      (elements) => elements.filter((element) => (element as HTMLElement).tabIndex >= 0).length,
    );

/** Moves focus from where it is in the sheet onto the dim, as a screen reader does; whether it stays. */
const isDimKeptFromSheet = async (page: Page): Promise<boolean> =>
  await page
    .locator(`[aria-modal="true"] [aria-label="${CLOSE}"][tabindex="-1"]`)
    .evaluate((dim) => {
      (dim as HTMLElement).focus();
      return dim.ownerDocument.activeElement === dim;
    });

/** What one sheet did with the keyboard, as the test compares it. */
const checkSheet = async (page: Page, opener: Opener, seeded: LivedIn) => {
  await opener.open(page, seeded);
  await expect(page.locator(SURFACE)).toBeVisible();
  const sheet = await page.locator(SURFACE).getAttribute("data-pace-sheet");
  // The modal moves focus after it mounts: given a moment.
  await expect.poll(async () => (await focus(page)).isInSheet, { message: opener.via }).toBe(true);
  const landed = await focus(page);
  const closeStops = await closeTabStops(page);
  // Shift+Tab wraps inside the sheet, never onto the full-screen dim (QA 19 L1).
  await page.keyboard.press("Shift+Tab");
  const isWrapped = (await focus(page)).isInSheet;
  // A screen reader moving on from the sheet onto the dim keeps it there (round 6 M4).
  const isOnDim = await isDimKeptFromSheet(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(SURFACE)).toHaveCount(0);
  // On a field when the sheet has one, never on a Close.
  const isRightStart = landed.hasField ? landed.isField : landed.name !== CLOSE;
  return {
    closeStops,
    // The named field where the opener gives one.
    field: opener.field === undefined ? isRightStart : landed.name,
    isOnDim,
    isWrapped,
    sheet,
    via: opener.via,
  };
};

const expectedOf = (opener: Opener, closeStops: number) => ({
  closeStops,
  field: opener.field ?? true,
  isOnDim: true,
  isWrapped: true,
  sheet: opener.sheet,
  via: opener.via,
});

const byText = (a: string, b: string): number => a.localeCompare(b);

/**
Sheets the web build never shows, each with why: their keyboard is the platform's, checked on a
device.
*/
const NOT_ON_THE_WEB: Readonly<Record<string, string>> = {
  "change-server":
    "the server line under the login card is Android's (login-screen.tsx); the web's login-screen.web.tsx has none",
};

test("every registered sheet has an opener here, or a reason it cannot be opened on the web", () => {
  const covered = [
    ...new Set(OPENERS.map((opener) => opener.sheet)),
    ...Object.keys(NOT_ON_THE_WEB),
  ];
  expect(covered.toSorted(byText)).toEqual(registeredSheets().toSorted(byText));
});

for (const size of SIZES) {
  test.describe(`every sheet takes the keyboard to its first field, ${size.name} (QA 18 M1)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("each sheet in the registry, from each way in", async ({ page }) => {
      test.setTimeout(150_000);
      const { token } = await loginViaApi(page);
      const seeded = await seedLivedIn(token);
      const openers = OPENERS.filter((opener) => opener.sizes?.includes(size.name) ?? true);
      const seen: Awaited<ReturnType<typeof checkSheet>>[] = [];
      for (const opener of openers) {
        seen.push(await checkSheet(page, opener, seeded));
      }
      expect(seen).toEqual(openers.map((opener) => expectedOf(opener, size.closeStops)));
    });
  });
}

/** Whether the focused element shows its ring (`:focus-visible`, never on a mouse click). */
const hasFocusRing = async (page: Page): Promise<boolean> =>
  await page.locator(":focus").evaluate((element) => element.matches(":focus-visible"));

test.describe("keyboard only: a sheet opened from a list row (Review Focus 5)", () => {
  test.use({ viewport: { height: 900, width: 1280 } });

  test("focus starts on its first control, Escape closes it, focus goes back to the row with its ring", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/history");
    const undo = page.getByRole("button", { exact: true, name: ru["common.undo"] }).first();
    await expect(undo).toBeVisible();
    // From the keyboard: onto the row's control (a Shift+Tab and a Tab come back onto it, so the
    // browser knows the keyboard moved it), then Enter opens the sheet.
    await undo.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(undo).toBeFocused();
    expect(await hasFocusRing(page)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator(SURFACE)).toBeVisible();
    await expect.poll(async () => (await focus(page)).isInSheet).toBe(true);
    // The first control (Cancel), never the dim or the cross; its ring shows.
    expect((await focus(page)).name).not.toBe(CLOSE);
    expect(await hasFocusRing(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator(SURFACE)).toHaveCount(0);
    await expect(undo).toBeFocused();
    expect(await hasFocusRing(page)).toBe(true);
  });
});
