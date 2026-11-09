import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

const DAY_MS = 24 * 60 * 60_000;

/** The last 12:00 UTC at or before now: daytime in the lived-in account's zone, never ahead. */
const lastMidday = (): number => {
  const midday = new Date();
  midday.setUTCHours(12, 0, 0, 0);
  return Math.min(
    midday.getTime(),
    midday.getTime() - DAY_MS * Number(midday.getTime() > Date.now()),
  );
};

/** A thumb's target on a phone (QA round 18 L6). */
const TARGET_PX = 44;

/** Which controls of a screen are measured, and in which directions. */
type Measured = {
  readonly path: string;
  /** ARIA roles of the controls. */
  readonly roles: readonly string[];
  /** Words in their names, when not every control of the roles is measured. */
  readonly names?: readonly string[];
  /** A Week block is as tall as its time (24 px at least): only its width is a choice. */
  readonly isWidthOnly?: boolean;
  /** How many there must be in sight, so the check never passes on an empty screen. */
  readonly atLeast: number;
  /** What brings the controls to life first (a disabled one takes no press). */
  readonly prepare?: (page: Page) => Promise<void>;
};

/**
The named controls in sight whose press area is under `TARGET_PX`, by name, and how many were
measured. The press area is found by pressing: the points 21 px either side of the control's centre
must land on the control (or inside it), never on a neighbour that covers it.
*/
const measure = async (
  page: Page,
  { isWidthOnly = false, names = [], roles }: Measured,
): Promise<{ readonly count: number; readonly small: readonly string[] }> =>
  await page.evaluate(
    ({ checksHeight, half, named, roleList }) => {
      // react-native-web draws a link as an anchor, which has the role without saying it.
      const selector = roleList
        .map((role) => (role === "link" ? '[role="link"], a' : `[role="${role}"]`))
        .join(", ");
      const isLandingOn = (control: Element, x: number, y: number): boolean => {
        const hit = globalThis.document.elementFromPoint(x, y);
        return hit !== null && control.contains(hit);
      };
      // Its whole box in the window and in its scroll view's sight (its top, middle and bottom
      // land on it): a control in the strip between the scroll view's bottom and the window's,
      // clipped behind the phone's tab bar, is not in sight, and a press there presses the bar
      // (the preset page's lowest switch once a row above it went, PR #54). Its own size is
      // what `small` measures, from the middle out.
      const isInSight = (control: Element): boolean => {
        const box = control.getBoundingClientRect();
        const x = box.left + box.width / 2;
        return (
          box.width > 0 &&
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= globalThis.innerHeight &&
          box.right <= globalThis.innerWidth &&
          [box.top + 1, box.top + box.height / 2, box.bottom - 1].every((y) =>
            isLandingOn(control, x, y),
          )
        );
      };
      const controls = [...globalThis.document.querySelectorAll(selector)]
        .filter((control) => control.closest('[aria-hidden="true"]') === null)
        .filter(
          (control) =>
            named.length === 0 ||
            named.some((word) => (control.getAttribute("aria-label") ?? "").includes(word)),
        )
        .filter((control) => isInSight(control));
      const small = controls.filter((control) => {
        const box = control.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const isWide = isLandingOn(control, x - half, y) && isLandingOn(control, x + half, y);
        const isTall = isLandingOn(control, x, y - half) && isLandingOn(control, x, y + half);
        return !isWide || (checksHeight && !isTall);
      });
      return {
        count: controls.length,
        small: small.map((control) => control.getAttribute("aria-label") ?? ""),
      };
    },
    { checksHeight: !isWidthOnly, half: TARGET_PX / 2 - 1, named: names, roleList: roles },
  );

/** Waits until the screen has drawn what it loads: the first-sync cover gone, nothing moving. */
const settled = async (page: Page): Promise<void> => {
  await expect(
    page.getByRole("progressbar", { name: /^(?:Syncing your data|Синхронизируем данные)$/u }),
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.waitForFunction(() =>
    globalThis.document.getAnimations().every((animation) => animation.playState !== "running"),
  );
};

/** The lived-in account's screens and the controls QA round 18 L6 measured on them. */
const screensOf = (openTaskId: string): readonly Measured[] => [
  {
    atLeast: 3,
    names: ["Новая задача", "Во входящие", "Отправить ассистенту"],
    path: "/",
    // A typed line wakes To Inbox and Send.
    prepare: async (page) => {
      await page.getByRole("textbox", { name: "Новая задача" }).fill("Купить марки");
    },
    roles: ["button"],
  },
  { atLeast: 1, names: ["example.com"], path: `/task/${openTaskId}`, roles: ["link"] },
  // A block's name ends in its times ("Музыка, 12:40–14:10").
  { atLeast: 2, isWidthOnly: true, names: ["–"], path: "/week", roles: ["button"] },
  { atLeast: 3, path: "/settings", roles: ["switch"] },
  {
    atLeast: 3,
    path: "/presets/hw",
    // The Work section's switches in the middle of the screen, where each is wholly in sight.
    prepare: async (page) => {
      await page.getByRole("switch", { name: "Переопределить: Прогресс" }).evaluate((element) => {
        element.scrollIntoView({ block: "center" });
      });
    },
    roles: ["switch"],
  },
];

test.describe("tap targets at 390 (QA round 18 L6)", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("the composer's icons, the task's link, the Week blocks and the switches are 44 px targets", async ({
    page,
  }) => {
    // Seeded and shown at a fixed midday, not at the real clock: run near midnight, the lived-in
    // day's evening blocks split at the day's edge into slivers that crowd one Week column
    // (bug class 54; QA round 18 L6's lane cap is a documented limit past six lanes).
    const seededAt = lastMidday();
    await page.clock.setFixedTime(seededAt + 30 * 60_000);
    const { token } = await loginViaApi(page);
    const { openTaskId } = await seedLivedIn(token, seededAt);
    for (const screen of screensOf(openTaskId)) {
      await page.goto(screen.path);
      await settled(page);
      await screen.prepare?.(page);
      // Polled: a typed line wakes the composer's buttons with a transition, and a control
      // measured mid-transition reads as small (bug class 20). A real small target stays small.
      await expect
        .poll(async () => (await measure(page, screen)).small, {
          message: screen.path,
          timeout: 5000,
        })
        .toEqual([]);
      const { count } = await measure(page, screen);
      expect(count, screen.path).toBeGreaterThanOrEqual(screen.atLeast);
    }
  });

  test("a press just over or under a switch flips it", async ({ page }) => {
    await loginViaApi(page);
    await page.goto("/settings");
    await settled(page);
    const toggle = page.getByRole("switch").first();
    await toggle.scrollIntoViewIfNeeded();
    const isBefore = await toggle.isChecked();
    // Just outside the drawn switch (its 32 px track), inside its 44 px web target (6 px each side).
    const track = toggle.getByTestId("switch-track");
    const { height, width, x, y } = (await track.boundingBox()) ?? {
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    };
    await page.mouse.click(x + width / 2, y - 4);
    await expect(toggle).toBeChecked({ checked: !isBefore });
    await page.mouse.click(x + width / 2, y + height + 4);
    await expect(toggle).toBeChecked({ checked: isBefore });
  });
});
