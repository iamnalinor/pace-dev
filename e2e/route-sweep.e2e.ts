import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import {
  expectedLanding,
  isBare,
  isSidebarScreen,
  screenUrls,
  STAND_IN_IDS,
} from "./support/routes.ts";
import {
  axeFaults,
  clippedText,
  LONG_QUIET_MS,
  rawKeys,
  repeatsAfterSettle,
  type ScreenWatch,
  settle,
  watchScreen,
} from "./support/screen-checks.ts";
import { seedLivedIn } from "./support/seed.ts";

/**
The mechanical matrix (it used to be scripted again by every exploratory QA round, docs/qa.md):
every screen of the app, read from the router's folder so a new one is covered without anyone adding
it, by a direct load, at phone and desktop width, in the light and the dark theme, on a lived-in
Russian account (every event type, real-looking text) and on a fresh English one (the empty and
first-run states). A screen fails when it throws or logs an error, a request fails or is refused,
it renders nothing or the crash screen, it lands elsewhere, (on a desktop) it loses the sidebar,
it shows a raw message key, its text does not fit, axe finds a serious violation, or once settled
it sends anything twice.
*/

const SIZES = [
  { height: 844, isWide: false, name: "phone", width: 390 },
  { height: 900, isWide: true, name: "desktop", width: 1440 },
] as const;

const THEMES = ["light", "dark"] as const;

/** Who is signed in: their ids for the dynamic routes and what greets them. */
const ACCOUNTS = [
  {
    name: "a lived-in Russian account",
    prepare: async (token: string) => await seedLivedIn(token),
  },
  { name: "a fresh English account", prepare: async () => STAND_IN_IDS },
] as const;

/**
Faults that are the design, each with why: matched on `url: fault` of a screen (none may hide a
fault on another screen).
*/
const BY_DESIGN: readonly { readonly match: RegExp; readonly why: string }[] = [
  {
    match: /^\/week: ".*" is cut to \d+ px with an ellipsis$/u,
    why: "the phone's week grid draws a block in a seventh of the width or less; its label is a hint, a tap opens the block's sheet that names it in full (week-grid.tsx)",
  },
];

/** What is wrong with the sidebar, by whether the screen should have it. */
const SIDEBAR_FAULT = ["shown on a bare screen", "missing"] as const;

/** The one refusal a signed-out visit may meet by design: the session check's. */
const SESSION_CHECK_REFUSED = "refused: GET /api/me 401";

/** What is wrong with where a signed-out visit landed: anywhere but the login, for a guarded screen. */
const landingFaults = (url: string, landed: string): readonly string[] => {
  const isPublic = url === "/no-such-page" || isBare(url);
  return isPublic || landed === "/login" ? [] : [`${url}: landed on ${landed}`];
};

/** Opens `url` and waits until what it shows (or where it sent the page) stops changing. */
const openSettled = async (page: Page, url: string): Promise<void> => {
  await page.goto(url);
  const settled = { previous: "" };
  await expect
    .poll(async () => {
      const now = `${page.url()} ${(await page.locator("body").innerText()).trim()}`;
      const isStable = now === settled.previous && now.length > page.url().length + 10;
      settled.previous = now;
      return isStable;
    })
    .toBe(true);
};

test("signed out, every screen but signing in lands on the login (bug class 7)", async ({
  page,
}) => {
  // The guard sits in one place (RouteGate in the root layout); a route moved to another folder
  // keeps it only if this holds for every route file, whatever navigator it lives in.
  test.setTimeout(120_000);
  const urls = screenUrls(STAND_IN_IDS);
  expect(urls.length).toBeGreaterThan(15);
  const failures: string[] = [];
  const watch = watchScreen(page);
  for (const url of urls) {
    watch.reset();
    await openSettled(page, url);
    const landed = new URL(page.url()).pathname;
    // Signed out, the session check alone may be refused (round 7 review 5): any other refused
    // call is a screen asking for what a signed-out visit has no right to.
    const errors = watch.faults().filter((fault) => fault !== SESSION_CHECK_REFUSED);
    failures.push(...landingFaults(url, landed), ...errors.map((error) => `${url}: ${error}`));
  }
  watch.stop();
  expect(failures).toEqual([]);
});

test.describe("guest document language", () => {
  test.use({ locale: "ru-RU" });

  test("Russian browser language reaches login and the HTML document", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Ваши задачи и время — в своём темпе.")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });
});

/** Everything wrong with the screen `url` opened on, once it has settled. */
const screenFaults = async (
  page: Page,
  { isWide, url }: { readonly isWide: boolean; readonly url: string },
): Promise<readonly string[]> => {
  const crashes = await page.getByText(/^(?:Что-то сломалось|Something broke)$/u).count();
  const sidebars = await page.getByRole("navigation", { name: /./u }).count();
  // A signed-in person is sent on from the sign-in screens: judge where the page landed.
  const landed = new URL(page.url()).pathname;
  const isSidebarExpected = isSidebarScreen(isWide, landed);
  const expected = expectedLanding(isWide, url);
  return [
    ...(expected === null || expected === landed ? [] : [`landed on ${landed}`]),
    ...Array.from({ length: crashes }, () => "the crash screen"),
    ...[`sidebar ${SIDEBAR_FAULT[Number(isSidebarExpected)] ?? ""}`].filter(
      () => isSidebarExpected === (sidebars === 0),
    ),
    ...(await rawKeys(page)).map((key) => `raw message key "${key}"`),
  ];
};

/** One visit of the matrix: the screen, the window, the theme and the visit's watch. */
type Visit = {
  readonly isWide: boolean;
  readonly theme: (typeof THEMES)[number];
  readonly url: string;
  /** Every URL the sweep visits: a screen that sends the person on to one is judged there. */
  readonly urls: readonly string[];
  readonly watch: ScreenWatch;
};

/** Opens the visit's screen, lets it settle and answers everything wrong with it. */
const visitFaults = async (page: Page, visit: Visit): Promise<readonly string[]> => {
  const { isWide, theme, url, urls, watch } = visit;
  watch.reset();
  await page.goto(url);
  const unsettled = await settle(page);
  const settledAt = watch.now();
  const landing = await screenFaults(page, { isWide, url });
  // A screen that sends the person on to another one in the list (the sign-in screens, Review):
  // that one is judged on its own visit.
  const landed = new URL(page.url()).pathname;
  const looks =
    landed !== url && urls.includes(landed)
      ? []
      : [
          ...(await axeFaults(page, { isColourOnly: theme === "dark" })),
          ...(await clippedText(page)),
          ...(await repeatsAfterSettle(watch, settledAt)),
        ];
  return [...unsettled, ...landing, ...looks, ...watch.faults()]
    .map((fault) => `${url}: ${fault}`)
    .filter((fault) => BY_DESIGN.every(({ match }) => !match.test(fault)));
};

for (const size of SIZES) {
  for (const theme of THEMES) {
    for (const account of ACCOUNTS) {
      test(`every screen on ${account.name}, ${size.name}, ${theme}`, async ({ page }) => {
        test.setTimeout(240_000);
        await page.setViewportSize({ height: size.height, width: size.width });
        await page.addInitScript((value) => {
          localStorage.setItem("pace.theme", value);
        }, theme);
        const { token } = await loginViaApi(page);
        const urls = screenUrls(await account.prepare(token));
        expect(urls.length).toBeGreaterThan(15);
        // The device's first sync once, before the sweep: the screens are judged on a device that
        // holds the account (the first sync itself is `sync-state.e2e.ts`'s), and the first visit
        // is not judged while the app is still starting.
        await page.goto("/");
        await expect(
          page.getByRole("navigation", { name: /./u }).or(page.getByRole("tablist")).first(),
        ).toBeVisible({ timeout: 20_000 });
        const failures: string[] = [];
        const watch = watchScreen(page);
        for (const url of urls) {
          failures.push(
            ...(await visitFaults(page, { isWide: size.isWide, theme, url, urls, watch })),
          );
        }
        watch.stop();
        expect(failures).toEqual([]);
      });
    }
  }
}

// The matrix's 2 s window misses a loop that repeats every 3 to 5 s (round 7 review): each screen
// once more, on each account at one size, with the long window.
for (const account of ACCOUNTS) {
  test(`every screen on ${account.name} sends nothing twice in ${String(LONG_QUIET_MS / 1000)} s once settled`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { token } = await loginViaApi(page);
    const urls = screenUrls(await account.prepare(token));
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: /./u }).first()).toBeVisible({
      timeout: 20_000,
    });
    const failures: string[] = [];
    const watch = watchScreen(page);
    for (const url of urls) {
      watch.reset();
      await page.goto(url);
      await settle(page);
      const repeats = await repeatsAfterSettle(watch, watch.now(), LONG_QUIET_MS);
      failures.push(...repeats.map((fault) => `${url}: ${fault}`));
    }
    watch.stop();
    expect(failures).toEqual([]);
  });
}
