import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { API_URL, createDevSession, README_TELEGRAM_ID, resetAccount } from "./support/login.ts";

/**
The README's screenshots, with a week of believable data. Off by default; run with
`README_SHOTS=docs/screenshots bun test:e2e e2e/readme-shots.e2e.ts` to refresh them.
*/
const SHOT_DIR = process.env["README_SHOTS"];

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID for a seeded event: the time part, then random characters. */
const ulid = (at: number): string => {
  const time = Array.from({ length: 10 }, (_, index) =>
    CROCKFORD.charAt(Math.floor(at / 32 ** (9 - index)) % 32),
  ).join("");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    CROCKFORD.charAt(byte % 32),
  ).join("");
  return `${time}${random}`;
};

const HOUR = 3_600_000;

type Block = {
  readonly label: string;
  readonly category: string;
  readonly from: number;
  readonly hours: number;
};

/** Local midnight `daysAgo` days back, as epoch ms (the browser and the shots share one zone). */
const midnight = (daysAgo: number): number => {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day.getTime() - daysAgo * 24 * HOUR;
};

/** Five past days: a night's sleep, focused mornings, lunch, an afternoon block. */
const week = (): readonly Block[] =>
  [5, 4, 3, 2, 1].flatMap((daysAgo) => {
    const start = midnight(daysAgo);
    const late = daysAgo % 2 === 0 ? 0.5 : 0;
    return [
      {
        category: "sleep",
        from: start - HOUR + late * HOUR,
        hours: 7.5 - late,
        label: "Sleep",
      },
      { category: "work", from: start + 9.5 * HOUR, hours: 2.5, label: "Quarterly report" },
      { category: "food", from: start + 13 * HOUR, hours: 0.75, label: "Lunch" },
      {
        category: "study",
        from: start + 15 * HOUR,
        hours: 1.5 + (daysAgo % 3) * 0.5,
        label: "Algebra",
      },
      { category: "commute", from: start + 18.5 * HOUR, hours: 0.5, label: "Home" },
    ];
  });

const seed = async (token: string): Promise<void> => {
  const now = Date.now();
  const events = week().map((block) => ({
    deviceId: "readme",
    id: ulid(block.from),
    occurredAt: new Date(block.from + block.hours * HOUR).toISOString(),
    payload: {
      activityId: ulid(block.from + 1),
      category: block.category,
      endAt: new Date(block.from + block.hours * HOUR).toISOString(),
      label: block.label,
      startAt: new Date(block.from).toISOString(),
    },
    precision: "exact",
    recordedAt: new Date(now).toISOString(),
    source: "web",
    type: "activity.logged",
  }));
  const response = await fetch(`${API_URL}/api/sync/push`, {
    body: JSON.stringify({ events }),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.ok).toBe(true);
};

const signIn = async (page: Page, token: string, theme: "dark" | "light"): Promise<void> => {
  await page.addInitScript(
    ({ session, value }) => {
      localStorage.setItem("pace.session", session);
      localStorage.setItem("pace.theme", value);
    },
    { session: token, value: theme },
  );
};

const add = async (page: Page, text: string): Promise<void> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially(text);
  await line.press("Enter");
  await expect(line).toHaveValue("");
};

/** Waits for the toasts to go, so the shot shows the screen itself. */
const shoot = async (page: Page, name: string): Promise<void> => {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  await page.screenshot({ path: `${SHOT_DIR ?? "."}/${name}.png` });
};

// Defined only when asked for: the regular e2e run has nothing to do here.
if (SHOT_DIR !== undefined) {
  test.describe("README screenshots", () => {
    test.setTimeout(120_000);

    test("Now, Day and Insights on a desktop and a phone", async ({ browser }) => {
      await resetAccount(README_TELEGRAM_ID);
      const { token } = await createDevSession(README_TELEGRAM_ID);
      await seed(token);

      const desktop = await browser.newPage({ viewport: { height: 860, width: 1440 } });
      await signIn(desktop, token, "light");
      await desktop.goto("/");
      for (const line of [
        "Finish the quarterly report friday 18:00 3h",
        "срочно позвонить в банк",
        "Read chapter 4 for the seminar tomorrow 1h",
        "Renew the passport",
        "Plan the trip to Kazan",
      ]) {
        await add(desktop, line);
      }
      await desktop.getByRole("button", { name: "Work", exact: true }).click();
      await shoot(desktop, "now-desktop");
      await desktop.goto("/day");
      await shoot(desktop, "day-desktop");
      await desktop.getByRole("button", { name: "Previous day" }).click();
      await shoot(desktop, "day-desktop");
      await desktop.goto("/insights");
      await shoot(desktop, "insights-desktop");

      const phone = await browser.newPage({ viewport: { height: 844, width: 390 } });
      await signIn(phone, token, "dark");
      await phone.goto("/");
      await expect(phone.getByText("Finish the quarterly report")).toBeVisible();
      await shoot(phone, "now-phone-dark");
      await phone.goto("/insights");
      await shoot(phone, "insights-phone-dark");
    });
  });
}
