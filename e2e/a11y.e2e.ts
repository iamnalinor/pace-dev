import type { Locator, Page } from "@playwright/test";

import { ru } from "./support/catalog.ts";
import { nowTasks } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, seedLivedIn, ulid } from "./support/seed.ts";

/**
The accessibility spec's own checks (redesign spec §8, "Tests that check it") that no other suite
makes: a Tab sweep where every stop shows its ring, the reflow budget at 320 px and at 200 %, one
level-1 heading per main route, and axe with a sheet open, a dialog open and in forced colours.
Covered elsewhere, not repeated here: the skip link (layout, web-baseline), focus into and back out
of every sheet (sheet-focus), the ring's colour (keyboard), axe on every screen at rest
(route-sweep) and with the Edit task sheet open (journeys), `document.title` (route-title unit
test, round6-minors, sessions).
*/

const DESKTOP = { height: 900, width: 1280 } as const;
const PHONE = { height: 844, width: 390 } as const;

/** The most Tab presses one sweep takes before it calls the screen endless. */
const MOST_STOPS = 150;

/** What the page says of the focused element after a Tab; `null` once the sweep came round. */
type Facts = {
  readonly name: string;
  readonly hasSize: boolean;
  readonly isVisible: boolean;
  /** An outline of 2 px or more, on the element or on the kit's inner visual. */
  readonly hasRing: boolean;
  /** A text field with a 2 px frame drawn next to it (its own focused state). */
  readonly hasFieldFrame: boolean;
};

/**
Reads the focused element after a Tab: nothing at the end of the sweep (focus left the page, or
came back to a stop it already saw), else what its indicator is. A visible indicator is an outline
of 2 px or more on the element, the kit's ring on its inner visual
(`[data-pace-inner]:focus-visible > [data-pace-visual]`), or a text field's own focused frame (a
2 px border drawn next to it).
*/
const readStop = async (page: Page): Promise<Facts | null> =>
  await page.evaluate(() => {
    const { document, getComputedStyle } = globalThis;
    const { paceSeen: seen } = globalThis as unknown as { paceSeen: Set<Element> };
    const element = document.activeElement;
    if (element === null || element === document.body || seen.has(element)) {
      return null;
    }
    seen.add(element);
    /** A line of 2 px or more in a colour: an outline, or a border's top. */
    const clear = "rgba(0, 0, 0, 0)";
    const isLine = (style: string, color: string, width: string): boolean =>
      style !== "none" && color !== clear && Number(width.replace("px", "")) >= 2;
    const hasRingOn = (node: Element | null): boolean => {
      if (node === null) {
        return false;
      }
      const { outlineColor, outlineStyle, outlineWidth } = getComputedStyle(node);
      return isLine(outlineStyle, outlineColor, outlineWidth);
    };
    const isFramed = (node: Element): boolean => {
      const { borderTopColor, borderTopStyle, borderTopWidth } = getComputedStyle(node);
      return (
        node.getBoundingClientRect().width > 0 &&
        isLine(borderTopStyle, borderTopColor, borderTopWidth)
      );
    };
    const hasFrameBeside = (field: Element): boolean => {
      let scope: Element | null = field.parentElement;
      for (let depth = 0; scope !== null && depth < 4; depth += 1) {
        if ([...scope.querySelectorAll("*")].some((node) => node !== field && isFramed(node))) {
          return true;
        }
        scope = scope.parentElement;
      }
      return false;
    };
    const box = element.getBoundingClientRect();
    const isField = element.matches(
      'input:not([type="range"]), textarea, [contenteditable="true"]',
    );
    const name = element.getAttribute("aria-label") ?? element.textContent;
    return {
      hasFieldFrame: isField && hasFrameBeside(element),
      hasRing:
        hasRingOn(element) ||
        hasRingOn(element.querySelector(":scope[data-pace-inner] > [data-pace-visual]")),
      hasSize: box.width >= 1 && box.height >= 1,
      isVisible: element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
      name: `${element.tagName.toLowerCase()} "${name.trim().slice(0, 50)}"`,
    };
  });

/** What is wrong with a stop's indicator, or null when it shows. */
const faultOf = (facts: Facts): null | string => {
  if (!facts.hasSize) {
    return "zero size";
  }
  if (!facts.isVisible) {
    return "invisible";
  }
  return facts.hasRing || facts.hasFieldFrame ? null : "no visible indicator";
};

/** Tabs through the page from where focus is, until it comes round; answers the faulty stops. */
const sweep = async (page: Page, where: string): Promise<readonly string[]> => {
  await page.evaluate(() => {
    Object.assign(globalThis, { paceSeen: new Set<Element>() });
  });
  const faults: string[] = [];
  let stops = 0;
  for (; stops < MOST_STOPS; stops += 1) {
    await page.keyboard.press("Tab");
    const facts = await readStop(page);
    if (facts === null) {
      break;
    }
    const fault = faultOf(facts);
    if (fault !== null) {
      faults.push(`${where}: ${facts.name}: ${fault}`);
    }
  }
  test.info().annotations.push({ description: `${where}: ${String(stops)} stops`, type: "sweep" });
  expect(stops, `${where}: Tab reached no control`).toBeGreaterThan(0);
  expect(stops, `${where}: the sweep never came round`).toBeLessThan(MOST_STOPS);
  return faults;
};

test.describe("the focus sweep (spec §8: every stop shows a ring of 2 px or more)", () => {
  test("Now, Day, a task page, Week and Settings on a computer", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(DESKTOP);
    const { token } = await loginViaApi(page);
    const { openTaskId } = await seedLivedIn(token);
    const faults: string[] = [];
    for (const path of ["/", "/day", `/task/${openTaskId}`, "/week", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      for (const name of [ru["sync.firstSync"], ru["sync.loadingData"]]) {
        await expect(page.getByRole("progressbar", { exact: true, name })).toHaveCount(0);
      }
      faults.push(...(await sweep(page, path)));
    }
    expect(faults).toEqual([]);
  });

  test("an open sheet on a phone keeps the keyboard inside and rings every stop", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/day");
    await page.getByRole("button", { name: ru["day.logPast"] }).click();
    const sheet = page.locator('[data-pace-surface="sheet"]');
    await expect(sheet).toBeVisible();
    const faults = await sweep(page, "Log past activity");
    // The sheet traps the keyboard: the sweep ended on a stop inside it, never on the page below.
    const outside = await page.evaluate(
      () =>
        [...(globalThis as unknown as { paceSeen: Set<Element> }).paceSeen].filter(
          (element) => element.closest('[data-pace-surface="sheet"]') === null,
        ).length,
    );
    expect(faults).toEqual([]);
    expect(outside).toBe(0);
  });
});

/**
The share of the window's height, down a line through the list's middle, where the list's scroll
region is what the person sees (not the time bar, a header or the tab bar over it).
*/
const listShare = async (list: Locator): Promise<number> =>
  await list.evaluate((element) => {
    const { document, getComputedStyle, innerHeight } = globalThis;
    let region: Element = element;
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll") {
        region = node;
        break;
      }
    }
    const box = element.getBoundingClientRect();
    const x = box.left + Math.min(box.width / 2, 40);
    const step = 4;
    let shown = 0;
    let rows = 0;
    for (let y = step / 2; y < innerHeight; y += step) {
      rows += 1;
      const top = document.elementFromPoint(x, y);
      if (top !== null && region.contains(top)) {
        shown += 1;
      }
    }
    return shown / rows;
  });

for (const viewport of [
  { height: 568, name: "320 px wide", width: 320 },
  { height: 450, name: "200 % zoom (640 × 450)", width: 640 },
]) {
  test(`at ${viewport.name} Now's list keeps half the window, a timer running (spec §8, 1.4.10)`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/");
    const list = page.getByRole("list", { exact: true, name: ru["now.tasks"] });
    await expect(list.getByRole("link").first()).toBeVisible();
    // Nothing on the page scrolls sideways at this width.
    const overflow = await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const share = await listShare(list);
    test.info().annotations.push({ description: share.toFixed(2), type: "list share" });
    expect(share).toBeGreaterThanOrEqual(0.5);
  });
}

/** The main routes, and those a phone reaches through More. */
const MAIN_ROUTES = [
  "/",
  "/day",
  "/week",
  "/inbox",
  "/projects",
  "/insights",
  "/history",
  "/settings",
] as const;

for (const { extra, viewport } of [
  { extra: ["/more"], viewport: PHONE },
  { extra: [], viewport: DESKTOP },
]) {
  test(`every main route has exactly one level-1 heading at ${String(viewport.width)} (spec §8, F-A11Y-05)`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    const { token } = await loginViaApi(page);
    const { algebraId, openTaskId } = await seedLivedIn(token);
    const routes = [...MAIN_ROUTES, ...extra, `/task/${openTaskId}`, `/project/${algebraId}`];
    const counts: Record<string, number> = {};
    for (const path of routes) {
      await page.goto(path);
      const headings = page.getByRole("heading", { level: 1 });
      await expect(headings.first()).toBeVisible();
      counts[path] = await headings.count();
    }
    expect(Object.entries(counts).filter(([, count]) => count !== 1)).toEqual([]);
  });
}

/** An English account with two open tasks, so History has rows to undo. */
const seedEnglish = async (token: string): Promise<void> => {
  const now = Date.now();
  const at = (offset: number): string => new Date(now - 60_000 + offset * 1000).toISOString();
  const bodies = [
    { payload: { language: "en", timezone: "UTC" }, type: "settings.updated" },
    ...["Send the invoice", "Call the bank"].map((title, index) => ({
      payload: { presetId: "personal", taskId: ulid(now - 50_000 + index), title },
      type: "task.created",
    })),
  ];
  const events = bodies.map((body, index) => ({
    ...body,
    deviceId: "e2e-seed",
    id: ulid(now - 40_000 + index),
    occurredAt: at(index),
    precision: "exact",
    recordedAt: at(index),
    source: "web",
  }));
  expect((await pushAsClient(token, events)).ok).toBe(true);
};

test.describe("axe where no other suite looks (spec §8)", () => {
  test("with Day's Log past activity sheet open on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE);
    const { token } = await loginViaApi(page);
    await seedEnglish(token);
    await page.goto("/day");
    await page.getByRole("button", { name: "Log past activity" }).click();
    await expect(page.locator('[data-pace-surface="sheet"]')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("with History's Undo dialog open on a computer", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const { token } = await loginViaApi(page);
    await seedEnglish(token);
    await page.goto("/history");
    await page
      .getByRole("button", { name: /^Undo: /u })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Undo event" })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  for (const viewport of [PHONE, DESKTOP]) {
    test(`on Now in forced colours at ${String(viewport.width)}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ forcedColors: "active" });
      const { token } = await loginViaApi(page);
      await seedEnglish(token);
      await page.goto("/");
      await expect(nowTasks(page).getByText("Send the invoice")).toBeVisible();
      expect(
        await page.evaluate(() => globalThis.matchMedia("(forced-colors: active)").matches),
      ).toBe(true);
      await expectNoA11yViolations(page);
    });
  }
});
