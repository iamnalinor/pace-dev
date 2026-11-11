import { AxeBuilder } from "@axe-core/playwright";
import {
  test as base,
  type BrowserContext,
  type BrowserContextOptions,
  expect,
  type Page,
} from "@playwright/test";

import { waitForTransitions } from "./animation-wait.ts";

/** Whether an axe finding is about colour alone (a fade may be what it measured). */
const isColourFault = (violation: { readonly id: string }): boolean =>
  violation.id === "color-contrast";

/** Fails on serious/critical WCAG 2.2 AA violations of the current page. */
export const expectNoA11yViolations = async (page: Page): Promise<void> => {
  // Check what the person sees once things settle, not a toast halfway through fading in. A loop
  // (a skeleton's breathing) never ends: only the animations that do are waited for.
  await waitForTransitions(page);
  // A fade the app drives itself (a reanimated opacity) is no web animation: a scan that finds only
  // colour faults is repeated until the page holds still, and fails on what stays.
  const scan = async () => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    return results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
  };
  let serious = await scan();
  if (serious.some((violation) => isColourFault(violation))) {
    try {
      await expect
        .poll(
          async () => {
            serious = await scan();
            return serious.length;
          },
          { intervals: [250], timeout: 3000 },
        )
        .toBe(0);
    } catch {
      // What stays after the wait is reported below.
    }
  }
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
};

export { expect } from "@playwright/test";

/** A context a test opens beside its own page; see `openContext`. */
export type OpenContext = (options?: BrowserContextOptions) => Promise<BrowserContext>;

/** Every page of the context lets go of its handlers, then the context closes (class 63). */
export const releaseContext = async (context: BrowserContext): Promise<void> => {
  for (const page of context.pages()) {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
  await context.close();
};

/**
Every test's page lets go of its route handlers when the test ends: a handler still awaiting
`route.fetch()` (the app polls `/api/instance`, re-reads `/api/sessions`) otherwise throws
"Test ended" after its test, an error that belongs to no test and stops the run (full e2e of A9
fix round 3, `login.e2e.ts` "a page older than its server…"; bug class 63). A test that needs a
browser context of its own (two devices, two tabs, a viewport) opens it with `openContext`, which
does the same for its pages and closes it whether the test passed or failed (PR A CI fix review I2);
`browser.newContext()` is not called in a test file (lint).
*/
export const test = base.extend<{ readonly openContext: OpenContext }>({
  openContext: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (options) => {
      const context = await browser.newContext(options);
      opened.push(context);
      return context;
    });
    for (const context of opened) {
      await releaseContext(context);
    }
  },
  page: async ({ page }, use) => {
    await use(page);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  },
});
