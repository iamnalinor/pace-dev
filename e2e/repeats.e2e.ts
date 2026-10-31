import type { TestInfo } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

/** Screenshots for review land here when set (the run's output folder otherwise). */
const SHOT_DIR = process.env["E2E_SHOT_DIR"];

const shotPath = (info: TestInfo, file: string): string =>
  SHOT_DIR === undefined ? info.outputPath(file) : `${SHOT_DIR}/${file}`;

const LOOKS = [
  { height: 844, scheme: "light", width: 390 },
  { height: 844, scheme: "dark", width: 390 },
  { height: 900, scheme: "light", width: 1440 },
  { height: 900, scheme: "dark", width: 1440 },
] as const;

for (const look of LOOKS) {
  test(`a series says it repeats, on its row and its screen (${String(look.width)}, ${look.scheme})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ height: look.height, width: look.width });
    await page.emulateMedia({ colorScheme: look.scheme });
    const { token } = await loginViaApi(page);
    // A Russian lived-in account with a monthly series "Квартплата" (a week of second stage).
    const { repeatingTaskId } = await seedLivedIn(token);
    const name = `repeats-${String(look.width)}-${look.scheme}`;

    await page.goto("/");
    const row = page.getByRole("link", { name: /^Квартплата/u }).first();
    await expect(row.getByRole("img", { name: "Повторяется" })).toBeVisible();
    await page.screenshot({ path: shotPath(info, `${name}-now.png`) });

    await page.goto(`/task/${repeatingTaskId}`);
    await expect(page.getByLabel("Повтор", { exact: true })).toContainText(/Каждый месяц, /u);
    await expect(page.getByLabel("Окончательный срок", { exact: true })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.screenshot({ path: shotPath(info, `${name}-task.png`) });
  });
}
