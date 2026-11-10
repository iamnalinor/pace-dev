import type { Page } from "@playwright/test";

import { addTask, deleteOpenTask, formByHand, nowTasks, taskForm } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import {
  controlsUnder,
  expectDescendantsStayInside,
  expectStaysInside,
} from "./support/geometry.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

/** The main screens and the tabs, sidebar links or rows of More that reach each (no reload). */
const PHONE_SCREENS: readonly (readonly [string, readonly string[]])[] = [
  ["Now", ["Now"]],
  ["Day", ["Day"]],
  ["Inbox", ["Inbox"]],
  ["More", ["More"]],
  ["Week", ["More", "Week"]],
  ["Settings", ["More", "Settings"]],
];

const DESKTOP_SCREENS: readonly (readonly [string, readonly string[]])[] = [
  ["Now", ["Now"]],
  ["Day", ["Day"]],
  ["Inbox", ["Inbox"]],
  ["Week", ["Week"]],
  ["Settings", ["Settings"]],
];

const SIZES = [
  { height: 844, name: "phone", screens: PHONE_SCREENS, width: 390 },
  { height: 900, name: "desktop", screens: DESKTOP_SCREENS, width: 1280 },
] as const;

const tap = async (page: Page, name: string): Promise<void> => {
  await page
    .getByRole("tab", { exact: true, name })
    .or(page.getByRole("link", { exact: true, name }))
    .first()
    .click();
};

/** Deletes a fresh task on Now: "Deleted: …" stays up as a toast, with Undo, for some seconds. */
const raiseToast = async (page: Page, title: string): Promise<void> => {
  await page.goto("/");
  await addTask(page, title);
  await nowTasks(page).getByText(title).click();
  await deleteOpenTask(page);
  await expect(page.getByTestId("toast-card")).toBeVisible();
};

/** How long the page must go without a scroll event before a wheel's scroll counts as done. */
const SCROLL_QUIET_MS = 150;
/** How long to wait for a first scroll event before deciding nothing under the pointer scrolls. */
const SCROLL_START_MS = 600;

/**
Turns the wheel and waits until the scroll it starts has ended. `mouse.wheel` resolves when the
event is sent, not when the page has scrolled: a slow browser (CI's headless shell) still showed
the old positions to the next read, and the rows that were about to scroll out read as stuck.
*/
const wheelAndSettle = async (page: Page, deltaY: number): Promise<void> => {
  // A handle on a box holding the promise (a promise itself would be awaited before the wheel),
  // so it lives in the page without a global of its own.
  const settled = await page.evaluateHandle(
    ({ quietMs, startMs }) => ({
      done: new Promise<void>((resolve) => {
        const signal = new AbortController();
        const finish = (): void => {
          signal.abort();
          resolve();
        };
        const timer = { id: setTimeout(finish, startMs) };
        globalThis.addEventListener(
          "scroll",
          () => {
            clearTimeout(timer.id);
            timer.id = setTimeout(finish, quietMs);
          },
          { capture: true, signal: signal.signal },
        );
      }),
    }),
    { quietMs: SCROLL_QUIET_MS, startMs: SCROLL_START_MS },
  );
  await page.mouse.wheel(0, deltaY);
  await settled.evaluate(async (scroll) => {
    await scroll.done;
  });
};

/**
The controls under the toast that stay under it once the content is scrolled by the toast's
height: a row of a long list may pass under the toast (spec §4.1.4 rule 3) but must scroll out
from under it; chrome (the time bar, the tab bar) never scrolls, so it stays found.
*/
const stuckUnderToast = async (page: Page): Promise<readonly string[]> => {
  const under = await controlsUnder(page, '[data-testid="toast-card"]');
  if (under.length === 0) {
    return [];
  }
  const toast = await page.getByTestId("toast-card").boundingBox();
  // Over the content above the toast (on a computer the toast floats in the content column, and
  // the wheel over the sidebar would scroll nothing).
  await page.mouse.move((toast?.x ?? 0) + (toast?.width ?? 0) / 2, (toast?.y ?? 0) - 40);
  await wheelAndSettle(page, (toast?.height ?? 0) + 120);
  const still = await controlsUnder(page, '[data-testid="toast-card"]');
  return under.filter((control) => still.includes(control));
};

const SHEET = '[data-pace-surface="sheet"]';

for (const size of SIZES) {
  test.describe(`overlays and motion, ${size.name}`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("a toast covers no control on any main screen, or one that cannot scroll out from under it (bug class 6)", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await loginViaApi(page);
      const covered: string[] = [];
      for (const [index, [screen, steps]] of size.screens.entries()) {
        await raiseToast(page, `Toast ${String(index)}`);
        for (const step of steps) {
          await tap(page, step);
        }
        await expect(page.getByTestId("toast-card")).toBeVisible();
        const stuck = await stuckUnderToast(page);
        covered.push(...stuck.map((control) => `${screen}: ${control}`));
      }
      expect(covered).toEqual([]);
    });

    test("a sheet opens with its title and buttons inside it (bug class 5)", async ({ page }) => {
      await loginViaApi(page);
      await page.goto("/");
      await addTask(page, `Sheet ${size.name}`);
      await nowTasks(page).getByText(`Sheet ${size.name}`).click();
      const edit = page.getByRole("button", { exact: true, name: "Edit" });
      // Its title and its foot (the buttons), at a phone's slide and a computer's dialog alike.
      for (const child of ['[role="heading"]', "> :last-child"]) {
        await expectStaysInside(page, {
          child: `${SHEET} ${child}`,
          container: SHEET,
          during: async () => {
            await edit.click();
          },
        });
        await page.keyboard.press("Escape");
        await expect(page.locator(SHEET)).toHaveCount(0);
      }
    });
  });
}

test.describe("motion and overlays at one width", () => {
  test("the composer's form unfolds inside its card on a phone: no box leaves the card in any frame (bug class 5, F-MOT-08)", async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    await page.getByRole("textbox", { name: "New task" }).pressSequentially("Pay the rent");
    await expectDescendantsStayInside(page, {
      container: '[data-testid="composer-card"]',
      during: async () => {
        await formByHand(page).click();
      },
    });
    await expect(taskForm(page)).toBeVisible();
  });

  test("the assistant's preview shows whole inside the card in every frame (QA 22 carry-over, Task 3.5)", async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    const line = page.getByRole("textbox", { name: "New task" });
    await line.pressSequentially("Pay the rent");
    await expectDescendantsStayInside(page, {
      container: '[data-testid="composer-card"]',
      during: async () => {
        await line.press("Enter");
        await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
      },
    });
    // Once announced, Approve is whole on screen: nothing to scroll before it can be pressed.
    await expect(page.getByRole("button", { name: "Approve" })).toBeInViewport({ ratio: 1 });
  });

  test("the assistant's preview unfolds without the card scrolling under the finger (fix round 2 of QA 22)", async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    const line = page.getByRole("textbox", { name: "New task" });
    await line.pressSequentially("Pay the rent");
    // A slow phone, where the unfold lags the content it reveals (seen in the full run's load).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // Every frame of the unfold: how far any box around the line has been scrolled. The card
    // clips while it grows, and a box that clips must never scroll: Approve would move away
    // from the finger and back (the press lands, the release misses).
    const sampled = page.evaluate(
      async (span) =>
        await new Promise<number>((resolve) => {
          const field = globalThis.document.querySelector('[aria-label="New task"]');
          const started = performance.now();
          let most = 0;
          const frame = (): void => {
            for (let box = field?.parentElement ?? null; box !== null; box = box.parentElement) {
              most = Math.max(most, box.scrollTop);
            }
            if (performance.now() - started < span) {
              globalThis.requestAnimationFrame(frame);
            } else {
              resolve(most);
            }
          };
          globalThis.requestAnimationFrame(frame);
        }),
      1500,
    );
    await line.press("Enter");
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(await sampled).toBe(0);
  });

  test("the time bar keeps the list at least half the window while something runs (region budget, Task 4.2)", async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    const bar = page.getByRole("region", { name: "Time" });
    await bar.getByRole("button", { exact: true, name: "Misc" }).click();
    await page.getByRole("button", { exact: true, name: "Walk" }).click();
    await expect(bar.getByRole("button", { name: /^Stop: Walk/u })).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.height ?? Infinity).toBeLessThanOrEqual(844 * 0.5);
    // The four tiles stay on screen with the field folded.
    await expect(bar.getByRole("button", { exact: true, name: "Chores" })).toBeInViewport();
  });

  test("the greyed Calendar button's tooltip covers no other control (bug class 6)", async ({
    page,
  }) => {
    // A pointer to hover with: a computer.
    await loginViaApi(page);
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto("/");
    await page.getByRole("button", { exact: true, name: "Calendar" }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    // Over the typed field above the bar, only while the pointer rests on Calendar: a hover
    // explanation sits on its control by design (class 6's rule), never over the bar's buttons.
    const covered = await controlsUnder(page, '[role="tooltip"]', [
      "Calendar",
      "What are you doing?",
    ]);
    expect(covered).toEqual([]);
  });
});

/**
Marks the tooltip bubble on show (`data-e2e-shown`): every trigger keeps its bubble in the page,
hidden, so the shown one is told by its box.
*/
const hasMarkedShownTooltip = async (page: Page): Promise<boolean> =>
  await page.evaluate(() => {
    for (const marked of globalThis.document.querySelectorAll<HTMLElement>("[data-e2e-shown]")) {
      delete marked.dataset["e2eShown"];
    }
    const shown = [...globalThis.document.querySelectorAll<HTMLElement>('[role="tooltip"]')].find(
      (tip) => {
        const box = tip.getBoundingClientRect();
        return box.width > 0 && globalThis.getComputedStyle(tip).visibility !== "hidden";
      },
    );
    if (shown === undefined) {
      return false;
    }
    shown.dataset["e2eShown"] = "";
    return true;
  });

/** Whether a tooltip shows within the hover delay and a little more; it is marked if it does. */
const isTooltipShownSoon = async (page: Page): Promise<boolean> => {
  try {
    await expect.poll(async () => await hasMarkedShownTooltip(page), { timeout: 1500 }).toBe(true);
    return true;
  } catch {
    return false;
  }
};

/**
Hovers each icon-only button of the page and lists the controls its tooltip covers (other than the
button itself). A button whose tooltip does not show (a disabled one) is `tooltips.e2e.ts`'s
concern; `shown` counts the tooltips looked at.
*/
const sweepTooltips = async (
  page: Page,
  url: string,
): Promise<{ readonly covered: readonly string[]; readonly shown: number }> => {
  const covered: string[] = [];
  let shown = 0;
  const names = new Set(await iconOnlyNames(page));
  for (const name of names) {
    // By its label as written (a role query reads the computed name, which a description may change).
    await page
      .getByLabel(name, { exact: true })
      // A period stepper keeps hidden twins of its controls (aria-hidden): the one in sight.
      .filter({ visible: true })
      .first()
      .hover({ timeout: 5000 });
    if (await isTooltipShownSoon(page)) {
      shown += 1;
      const under = await controlsUnder(page, "[data-e2e-shown]", [name]);
      covered.push(...under.map((control) => `${url} "${name}": ${control}`));
    }
    await page.mouse.move(0, 0);
    // The bubble lingers a moment after the pointer leaves (it can be reached, WCAG 1.4.13) and is
    // unmounted then: the next hover must not find and mark the one going away.
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  }
  return { covered, shown };
};

/** The buttons named only by their label (an icon, digits at most): those show a tooltip. */
const iconOnlyNames = async (page: Page): Promise<readonly string[]> =>
  await page.evaluate(() =>
    [...globalThis.document.querySelectorAll<HTMLElement>('[role="button"], button')]
      .filter((button) => {
        const box = button.getBoundingClientRect();
        const name = button.getAttribute("aria-label") ?? "";
        // In sight and on top: a press at its centre reaches it (not a screen left under another).
        const hit = globalThis.document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        const isOnTop = hit !== null && button.contains(hit);
        return isOnTop && name !== "" && !/\p{L}/u.test(button.textContent.trim());
      })
      .map((button) => button.getAttribute("aria-label") ?? ""),
  );

test.describe("tooltips and toasts on Now, Day and a task (Task 3.7, bug class 6)", () => {
  test.use({ viewport: { height: 900, width: 1280 } });

  test("no tooltip covers an enabled control other than the one it explains", async ({ page }) => {
    test.setTimeout(180_000);
    const { token } = await loginViaApi(page);
    const seeded = await seedLivedIn(token);
    const covered: string[] = [];
    let swept = 0;
    for (const url of ["/", "/day", `/task/${seeded.openTaskId}`]) {
      await page.goto(url);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(page.getByRole("progressbar")).toHaveCount(0);
      // The account's Russian arrives with the first sync: names read before it are gone after.
      await expect(page.getByRole("link", { exact: true, name: "Сейчас" })).toBeVisible();
      const found = await sweepTooltips(page, url);
      swept += found.shown;
      covered.push(...found.covered);
    }
    expect(covered).toEqual([]);
    expect(swept).toBeGreaterThan(3);
  });

  test("a toast covers no control on a task it cannot scroll out from under", async ({ page }) => {
    await loginViaApi(page);
    await page.goto("/");
    await addTask(page, "Open me after");
    // Deleting another task leaves its toast (with Undo) up while the first one opens.
    await raiseToast(page, "Toast on a task");
    await nowTasks(page).getByText("Open me after").click();
    await expect(page.getByRole("button", { exact: true, name: "More actions" })).toBeVisible();
    await expect(page.getByTestId("toast-card")).toBeVisible();
    expect(await stuckUnderToast(page)).toEqual([]);
  });
});
