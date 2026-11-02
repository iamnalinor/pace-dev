import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";

import { addTask, nowTasks } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

type Scheme = "dark" | "light";
type Preference = "system" | Scheme;

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path inside the repo
const GENERATED_TOKENS = readFileSync(
  new URL("../apps/app/src/ui/generated/tokens.ts", import.meta.url),
  "utf8",
);

/** A theme's generated CSS variable (`--pace-app`), read from the committed tokens module. */
const themeVar = (scheme: Scheme, name: string): string => {
  const theme = GENERATED_TOKENS.slice(GENERATED_TOKENS.indexOf(`  ${scheme}: {`));
  // eslint-disable-next-line security/detect-non-literal-regexp -- `name` is one of this file's own literals, never input
  const value = new RegExp(`"${name}": "([^"]+)"`, "u").exec(theme)?.[1];
  if (value === undefined) {
    throw new Error(`${name} is missing from the generated ${scheme} theme`);
  }
  return value;
};

/** `#rrggbb` as lower-case channels. */
const channels = (hex: string): number[] =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/**
The page ground of a theme, worked out here from the generated tokens and not by `documentGround`
(which the page's own code uses): `bg.app`, or that under the scrim a sheet draws.
*/
const documentGround = (scheme: Scheme, isDimmed: boolean): string => {
  const app = themeVar(scheme, "--pace-app").toLowerCase();
  if (!isDimmed) {
    return app;
  }
  const scrim = (/rgba\(([^)]+)\)/u.exec(themeVar(scheme, "--pace-scrim"))?.[1] ?? "")
    .split(",")
    .map(Number);
  const alpha = scrim[3] ?? 1;
  const mixed = channels(app).map((under, index) =>
    Math.round((scrim[index] ?? 0) * alpha + under * (1 - alpha)),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

/** `#rrggbb` as the browser prints a computed colour. */
const rgb = (hex: string): string => `rgb(${channels(hex).join(", ")})`;

type PageState = {
  readonly body: string;
  readonly colorScheme: string;
  readonly metas: readonly (null | string)[];
  readonly theme: string | undefined;
};

/** What the browser would paint from the document alone: ground, `color-scheme`, the status bar. */
const pageState = async (page: Page): Promise<PageState> =>
  await page.locator("html").evaluate((root) => {
    const view = root.ownerDocument;
    return {
      body: getComputedStyle(view.body).backgroundColor,
      colorScheme: getComputedStyle(root).colorScheme,
      metas: [...view.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
        meta.getAttribute("content"),
      ),
      theme: root.dataset["theme"],
    };
  });

/** The page as it must be in `scheme`: its theme, ground, scheme and both metas. */
const settled = (scheme: Scheme, isDimmed = false): PageState => ({
  body: rgb(documentGround(scheme, false)),
  colorScheme: scheme,
  metas: [documentGround(scheme, isDimmed), documentGround(scheme, isDimmed)],
  theme: scheme,
});

const remember = async (page: Page, preference: null | Preference): Promise<void> => {
  await page.addInitScript((value) => {
    if (value !== null) {
      localStorage.setItem("pace.theme", value);
    }
  }, preference);
};

// A dark-theme user on a light phone, a light-theme user on a dark one, and the preference
// agreeing with the OS or deferring to it: the page must be the app's colour from the first byte.
const CASES: readonly (readonly [null | Preference, Scheme, Scheme])[] = [
  ["dark", "light", "dark"],
  ["light", "dark", "light"],
  ["dark", "dark", "dark"],
  ["light", "light", "light"],
  ["system", "light", "light"],
  ["system", "dark", "dark"],
  [null, "light", "light"],
  [null, "dark", "dark"],
];

for (const [preference, system, expected] of CASES) {
  test(`before the bundle loads the page is ${expected} for ${String(preference)} on a ${system} system (F-WEB-02)`, async ({
    page,
  }) => {
    // No script of the app runs: only index.html, its stylesheet and theme-boot.js decide.
    await page.route(/\/_expo\/static\/js\//u, async (route) => {
      await route.abort();
    });
    await page.emulateMedia({ colorScheme: system });
    await remember(page, preference);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(await pageState(page)).toEqual(settled(expected));
  });
}

test("the page keeps the stored theme while the app starts and follows the toggle in Settings", async ({
  page,
}) => {
  await loginViaApi(page);
  await page.emulateMedia({ colorScheme: "light" });
  await remember(page, "dark");
  // Every value `data-theme` takes from the first script on: a flip to the OS's light before
  // the stored dark loads would be the flash again.
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(globalThis, "themesSeen", { value: seen });
    // Each record names the value the attribute had before that write, so two writes inside one
    // task (dark, then the OS's light, then dark again) cannot hide behind the last one.
    // The whole document: <html> does not exist yet when this runs.
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.oldValue !== null) {
          seen.push(record.oldValue);
        }
      }
    }).observe(document, {
      attributeFilter: ["data-theme"],
      attributeOldValue: true,
      attributes: true,
      subtree: true,
    });
  });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await pageState(page)).toEqual(settled("dark"));
  // Every value the attribute held before a later write, then the one it holds now.
  const earlier = await page.evaluate(() => Reflect.get(globalThis, "themesSeen") as string[]);
  expect(new Set([...earlier, "dark"])).toEqual(new Set(["dark"]));

  await page.getByRole("radio", { name: "Light" }).click();
  await expect.poll(async () => await pageState(page)).toEqual(settled("light"));
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(async () => await pageState(page)).toEqual(settled("dark"));
  // System defers to the OS again, light here.
  await page.getByRole("radio", { name: "System" }).click();
  await expect.poll(async () => await pageState(page)).toEqual(settled("light"));
  // And the other way round: the OS turns dark while the app follows it.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(async () => await pageState(page)).toEqual(settled("dark"));
});

for (const [preference, system] of [
  ["dark", "light"],
  ["light", "dark"],
] as const) {
  test(`an open sheet dims the status bar, ${preference} app on a ${system} system`, async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.emulateMedia({ colorScheme: system });
    await remember(page, preference);
    await page.goto("/");
    await addTask(page, `Dim ${preference}`);
    await nowTasks(page).getByText(`Dim ${preference}`).click();
    expect(await pageState(page)).toEqual(settled(preference));
    await page.getByRole("button", { name: "Edit details" }).click();
    await expect(page.locator('[data-pace-surface="sheet"]')).toBeVisible();
    await expect.poll(async () => await pageState(page)).toEqual({ ...settled(preference, true) });
    // The ground itself stays: only the status bar dims with the backdrop.
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-pace-surface="sheet"]')).toHaveCount(0);
    await expect.poll(async () => await pageState(page)).toEqual(settled(preference));
  });
}
