import { AxeBuilder } from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/** Fails on serious/critical WCAG 2.2 AA violations of the current page. */
export const expectNoA11yViolations = async (page: Page): Promise<void> => {
  // Check what the person sees once things settle, not a toast halfway through fading in.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
};

export { expect } from "@playwright/test";

/**
Every test's page lets go of its route handlers when the test ends: a handler still awaiting
`route.fetch()` (the app polls `/api/instance`, re-reads `/api/sessions`) otherwise throws
"Test ended" after its test, an error that belongs to no test and stops the run (full e2e of A9
fix round 3, `login.e2e.ts` "a page older than its server…"; bug class 63).
*/
export const test = base.extend({
  page: async ({ page }, use) => {
    await use(page);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  },
});
