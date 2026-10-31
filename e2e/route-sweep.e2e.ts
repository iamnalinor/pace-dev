import type { Page } from "@playwright/test";

import { readdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { type LivedIn, seedLivedIn } from "./support/seed.ts";

/**
Opens every screen of the app on a lived-in account (Russian text, every event type), by a
direct load, at phone and desktop width. A screen fails the sweep when the page throws or logs
an error, renders nothing, shows the crash screen, or (on a desktop) loses the sidebar. The
route list is read from `apps/app/app`, so a new screen is swept without anyone adding it.
*/

const APP_DIR = path.resolve(import.meta.dirname, "../apps/app/app");

/**
Screens that are not meant to have the sidebar: signing in (and its way back) and the walk-through.
A copy of `BARE_PATHS` in apps/app/src/auth/route-gate.tsx (e2e may not import from the app); keep
the two lists the same.
*/
const BARE = ["/login", "/auth", "/app/auth", "/app/login", "/onboarding", "/oauth"];

const routeFiles = (): readonly string[] =>
  readdirSync(APP_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${path.relative(APP_DIR, path.join(entry.parentPath, entry.name))}`);

/** What is wrong with the sidebar, by whether the screen should have it. */
const SIDEBAR_FAULT = ["shown on a bare screen", "missing"] as const;

/** On a desktop every screen but signing in and the walk-through keeps the sidebar. */
const isSidebarScreen = (size: string, url: string): boolean =>
  size === "desktop" && BARE.every((bare) => url !== bare && !url.startsWith(`${bare}/`));

/** A route file as the URLs that open it on the seeded account (none for layouts and hooks). */
const urlsOf = (file: string, seeded: LivedIn): readonly string[] => {
  const route = file
    .replace(/\.tsx?$/u, "")
    .replaceAll(/\/\([^)]+\)/gu, "")
    .replace(/\/index$/u, "");
  if (/(?:^|\/)_layout$|\+native-intent$/u.test(route)) {
    return [];
  }
  if (route.endsWith("+not-found")) {
    return ["/no-such-page"];
  }
  if (route === "/task/[id]") {
    return [
      `/task/${seeded.openTaskId}`,
      `/task/${seeded.doneTaskId}`,
      `/task/${seeded.repeatingTaskId}`,
    ];
  }
  if (route === "/project/[id]") {
    return [`/project/${seeded.algebraId}`];
  }
  if (route === "/presets/[id]") {
    return ["/presets/hw.seeded"];
  }
  return [route === "" ? "/" : route];
};

const SIZES = [
  { height: 844, name: "phone", width: 390 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

/** Errors the page reported while `run` ran: thrown exceptions and console.error lines. */
const collectErrors = async (page: Page, run: () => Promise<void>): Promise<readonly string[]> => {
  const errors: string[] = [];
  const onError = (error: Error): void => {
    errors.push(`pageerror: ${error.message}`);
  };
  const onConsole = (message: { type: () => string; text: () => string }): void => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  await run();
  page.off("pageerror", onError);
  page.off("console", onConsole);
  return errors;
};

/** Stand-ins for a dynamic route's id: signed out, nothing is read before the guard. */
const SIGNED_OUT_IDS: LivedIn = {
  algebraId: "01SIGNEDOUT00000000000000A",
  doneTaskId: "01SIGNEDOUT00000000000000D",
  openTaskId: "01SIGNEDOUT00000000000000O",
  repeatingTaskId: "01SIGNEDOUT00000000000000R",
};

/** What is wrong with where a signed-out visit landed: anywhere but the login, for a guarded screen. */
const landingFaults = (url: string, landed: string): readonly string[] => {
  const isPublic =
    url === "/no-such-page" || BARE.some((bare) => url === bare || url.startsWith(`${bare}/`));
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
  const urls = routeFiles().flatMap((file) => urlsOf(file, SIGNED_OUT_IDS));
  expect(urls.length).toBeGreaterThan(15);
  const failures: string[] = [];
  for (const url of urls) {
    const errors = await collectErrors(page, async () => {
      await openSettled(page, url);
    });
    const landed = new URL(page.url()).pathname;
    failures.push(...landingFaults(url, landed), ...errors.map((error) => `${url}: ${error}`));
  }
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

for (const size of SIZES) {
  test.describe(`route sweep, ${size.name}`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("every screen renders on a lived-in account", async ({ page }) => {
      test.setTimeout(180_000);
      const { token } = await loginViaApi(page);
      const seeded = await seedLivedIn(token);
      const urls = routeFiles().flatMap((file) => urlsOf(file, seeded));
      expect(urls.length).toBeGreaterThan(15);
      const failures: string[] = [];
      for (const url of urls) {
        const errors = await collectErrors(page, async () => {
          await page.goto(url);
          await expect
            .poll(async () => (await page.locator("body").innerText()).trim().length, {
              message: `${url} renders something`,
            })
            .toBeGreaterThan(10);
          // The sync pull lands and the screen re-renders with the seeded data: wait until the
          // text stops changing.
          const settled = { previous: "" };
          await expect
            .poll(async () => {
              const text = await page.locator("body").innerText();
              const isStable = text === settled.previous;
              settled.previous = text;
              return isStable;
            })
            .toBe(true);
        });
        const crashes = await page.getByText("Что-то сломалось").count();
        const sidebars = await page.getByRole("navigation", { name: /./u }).count();
        // A signed-in person is sent on from the sign-in screens: judge where the page landed.
        const isSidebarExpected = isSidebarScreen(size.name, new URL(page.url()).pathname);
        failures.push(
          ...errors.map((error) => `${url}: ${error}`),
          ...Array.from({ length: crashes }, () => `${url}: the crash screen`),
          ...[`${url}: sidebar ${SIDEBAR_FAULT[Number(isSidebarExpected)] ?? ""}`].filter(
            () => isSidebarExpected === (sidebars === 0),
          ),
        );
      }
      expect(failures).toEqual([]);
    });
  });
}
