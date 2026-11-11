import type { Locator, Page } from "@playwright/test";

import { gzipSync } from "node:zlib";

import { en, ru } from "./support/catalog.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { outboxSent } from "./support/outbox.ts";
import { seedLivedIn } from "./support/seed.ts";

/**
The web build's baseline (redesign spec §7, design overhaul C): the page an app is, not a document.
The first frame speaks the account's language, the landmarks are the same at every width, a phone
neither zooms into a field nor selects a button's label on a long press, the production headers
(CSP) hold and nothing they forbid is tried, the screen does not jump while it loads, and the entry
bundle does not grow.
*/

const PHONE = { height: 844, width: 390 } as const;
const DESKTOP = { height: 900, width: 1440 } as const;

/** The shell's words whose English and Russian differ: one of them in a Russian frame is a leak. */
const SHELL_KEYS = [
  "nav.now",
  "nav.day",
  "nav.week",
  "nav.more",
  "nav.inbox",
  "nav.projects",
  "nav.insights",
  "nav.settings",
  "nav.history",
  "nav.skipToContent",
  "nav.newTask",
  "sync.loadingData",
] as const;

/**
Records, from the document's start, every piece of text the page ever shows (each text node as it
is added or changed) and `<html lang>` at `DOMContentLoaded`, for `seenSoFar`.
*/
const recordFromFirstPaint = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    const state = { langAtReady: "" };
    const { Node: NodeType, NodeFilter: Filter, document } = globalThis;
    const collect = (node: Node): void => {
      if (node.nodeType === NodeType.TEXT_NODE) {
        const text = (node.textContent ?? "").trim();
        if (text !== "") {
          seen.add(text);
        }
        return;
      }
      const walker = document.createTreeWalker(node, Filter.SHOW_TEXT);
      for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
        collect(text);
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          collect(record.target);
        }
        for (const added of record.addedNodes) {
          collect(added);
        }
      }
    }).observe(document, { characterData: true, childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => {
      state.langAtReady = document.documentElement.lang;
    });
    Object.assign(globalThis, {
      paceSeen: () => ({ langAtReady: state.langAtReady, texts: [...seen] }),
    });
  });
};

/** What `recordFromFirstPaint` has seen since the last load. */
const seenSoFar = async (
  page: Page,
): Promise<{ readonly langAtReady: string; readonly texts: readonly string[] }> =>
  await page.evaluate(() =>
    (
      globalThis as unknown as {
        paceSeen: () => { langAtReady: string; texts: string[] };
      }
    ).paceSeen(),
  );

const storedLanguage = async (page: Page): Promise<null | string> =>
  await page.evaluate(() => localStorage.getItem("pace.language"));

test.describe("the first frame speaks the account's language (F-DAT-04)", () => {
  test.use({ viewport: PHONE });

  test("a Russian account's reload shows no English shell word and has lang=ru by DOMContentLoaded; Sign out forgets it", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: ru["nav.now"] })).toBeVisible();
    await expect.poll(async () => await storedLanguage(page)).toBe("ru");

    await recordFromFirstPaint(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: ru["nav.now"] })).toBeVisible();
    await expect(page.getByRole("list", { name: ru["now.tasks"] })).toBeVisible();
    const { langAtReady, texts } = await seenSoFar(page);
    expect(langAtReady).toBe("ru");
    const english = new Set(
      SHELL_KEYS.filter((key) => en[key] !== ru[key]).map((key) => en[key] as string),
    );
    expect(texts.filter((text) => english.has(text))).toEqual([]);

    // Signed out, the next load is the browser's language again.
    await outboxSent(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: ru["settings.logout"] }).click();
    await expect(page).toHaveURL(/\/login$/u);
    await expect.poll(async () => await storedLanguage(page)).toBeNull();
  });
});

for (const viewport of [PHONE, DESKTOP]) {
  test(`exactly one main and a skip link into it at ${String(viewport.width)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginViaApi(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator('main, [role="main"]')).toHaveCount(1);
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });
}

/** The middle of what `locator` draws, in the page's coordinates. */
const centreOf = async (locator: Locator): Promise<{ readonly x: number; readonly y: number }> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("nothing drawn to press");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Every visible text field's font size, by its accessible name or placeholder. */
const smallFields = async (page: Page, where: string): Promise<readonly string[]> =>
  await page.evaluate((screen) => {
    const fields = globalThis.document.querySelectorAll<HTMLElement>(
      'textarea, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="range"], [type="hidden"], [type="button"], [type="submit"])',
    );
    const sizeOf = (field: HTMLElement): number =>
      Number(globalThis.getComputedStyle(field).fontSize.replace("px", ""));
    return [...fields]
      .filter((field) => field.getBoundingClientRect().width > 0 && sizeOf(field) < 16)
      .map((field) => {
        const name =
          field.getAttribute("aria-label") ?? field.getAttribute("placeholder") ?? field.tagName;
        return `${screen}: "${name}" is ${String(sizeOf(field))} px`;
      });
  }, where);

test.describe("a phone's page is an app, not a document (spec §7)", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE });

  test("pulling at the top reloads nothing, and the keyboard resizes the page", async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const overscroll = await page.evaluate(() => {
      const { body, documentElement } = globalThis.document;
      return [documentElement, body].map(
        (element) => globalThis.getComputedStyle(element).overscrollBehaviorY,
      );
    });
    expect(overscroll).toEqual(["none", "none"]);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /(?:^|,)\s*interactive-widget=resizes-content\s*(?:,|$)/u,
    );
  });

  test("no text field is under 16 px on Now, Day's Log past activity sheet and Settings (a phone zooms into it)", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: ru["nav.newTask"] })).toBeVisible();
    const small = [...(await smallFields(page, "Now"))];
    await page.goto("/day");
    await page.getByRole("button", { name: ru["day.logPast"] }).click();
    await expect(page.locator('[data-pace-surface="sheet"]')).toBeVisible();
    small.push(...(await smallFields(page, "Log past activity")));
    await page.keyboard.press("Escape");
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: ru["settings.title"] })).toBeVisible();
    small.push(...(await smallFields(page, "Settings")));
    expect(small).toEqual([]);
  });

  test("a 700 ms touch-hold on a button selects none of its text", async ({ page }) => {
    await loginViaApi(page);
    await page.goto("/settings");
    const button = page.getByRole("button", { name: "Sign out" });
    await expect(button).toBeVisible();
    const at = await centreOf(button);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { touchPoints: [at], type: "touchStart" });
    // eslint-disable-next-line playwright/no-wait-for-timeout, sonarjs/no-fixed-wait-in-tests -- a long press is a touch held for a time; no DOM condition marks it
    await page.waitForTimeout(700);
    const selected = await page.evaluate(() => globalThis.getSelection()?.toString() ?? "");
    await cdp.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchCancel" });
    expect(selected).toBe("");
    // The rule itself, so a browser that would select shows it too.
    const style = await button.evaluate((element) => {
      const computed = globalThis.getComputedStyle(element);
      return { userSelect: computed.userSelect };
    });
    expect(style.userSelect).toBe("none");
  });
});

/**
Records every `securitypolicyviolation` the page reports, from the document's start; read with
`violations`.
*/
const recordViolations = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    globalThis.document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI} (${event.sourceFile})`);
    });
    Object.assign(globalThis, { paceViolations: () => seen });
  });
};

const violations = async (page: Page): Promise<readonly string[]> =>
  await page.evaluate(() =>
    (globalThis as unknown as { paceViolations: () => string[] }).paceViolations(),
  );

test("the document carries the production CSP and no screen tries what it forbids (F-WEB-16)", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const { token } = await loginViaApi(page);
  await seedLivedIn(token);
  await recordViolations(page);
  const found: string[] = [];
  for (const path of ["/", "/day", "/settings"]) {
    const response = await page.goto(path);
    const policy = (await response?.headerValue("content-security-policy")) ?? "";
    expect(
      policy.split(";").map((part) => part.trim()),
      path,
    ).toContain("frame-ancestors 'none'");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // The account's data came through the policy: the sync answered.
    await expect(
      page.getByRole("progressbar", { name: /^(?:Syncing your data|Loading your data…)$/u }),
    ).toHaveCount(0);
    found.push(...(await violations(page)).map((violation) => `${path}: ${violation}`));
  }
  expect(found).toEqual([]);
});

/** How much the layout may shift while a screen loads (Core Web Vitals' "good" is 0.1). */
const CLS_BOUND = 0.05;
/** How long no shift must come before the screen counts as settled. */
const SHIFT_QUIET_MS = 1500;

/** Sums the layout shifts not caused by input, from the document's start; read with `shifts`. */
const recordShifts = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const state = { last: performance.now(), total: 0 };
    const sources: string[] = [];
    const { HTMLElement: Html } = globalThis;
    const nameOf = (node: Node | null): string => {
      if (!(node instanceof Html)) {
        return node?.nodeName ?? "(gone)";
      }
      const label =
        node.dataset["testid"] ?? node.getAttribute("aria-label") ?? node.textContent.trim();
      return `${node.tagName.toLowerCase()} "${label.slice(0, 40)}"`;
    };
    new PerformanceObserver((list) => {
      type Shift = PerformanceEntry & {
        readonly hadRecentInput: boolean;
        readonly value: number;
        readonly sources: readonly {
          readonly node: Node | null;
          readonly previousRect: DOMRectReadOnly;
          readonly currentRect: DOMRectReadOnly;
        }[];
      };
      for (const entry of list.getEntries() as Shift[]) {
        if (entry.hadRecentInput) {
          continue;
        }
        state.total += entry.value;
        state.last = performance.now();
        for (const source of entry.sources) {
          const { currentRect: to, previousRect: from } = source;
          sources.push(
            `${entry.value.toFixed(4)} ${nameOf(source.node)} (${String(Math.round(from.x))},${String(Math.round(from.y))} ${String(Math.round(from.width))}×${String(Math.round(from.height))} → ${String(Math.round(to.x))},${String(Math.round(to.y))} ${String(Math.round(to.width))}×${String(Math.round(to.height))})`,
          );
        }
      }
    }).observe({ buffered: true, type: "layout-shift" });
    Object.assign(globalThis, {
      paceShifts: () => ({
        quietFor: performance.now() - state.last,
        sources,
        total: state.total,
      }),
    });
  });
};

const shifts = async (
  page: Page,
): Promise<{
  readonly quietFor: number;
  readonly sources: readonly string[];
  readonly total: number;
}> =>
  await page.evaluate(() =>
    (
      globalThis as unknown as {
        paceShifts: () => { quietFor: number; sources: string[]; total: number };
      }
    ).paceShifts(),
  );

test("a lived-in account's Now and History load without the layout jumping (CLS ≤ 0.05)", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const { token } = await loginViaApi(page);
  await seedLivedIn(token);
  // The local copy is filled once, as on any later visit.
  await page.goto("/");
  await expect(page.getByRole("list", { name: ru["now.tasks"] })).toBeVisible();
  await recordShifts(page);
  const results: Record<string, { readonly sources: readonly string[]; readonly total: number }> =
    {};
  for (const path of ["/", "/history"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect
      .poll(async () => (await shifts(page)).quietFor, { timeout: 15_000 })
      .toBeGreaterThan(SHIFT_QUIET_MS);
    const { sources, total } = await shifts(page);
    results[path] = { sources, total: Math.round(total * 10_000) / 10_000 };
  }
  test.info().annotations.push({ description: JSON.stringify(results), type: "layout shift" });
  for (const [path, { sources, total }] of Object.entries(results)) {
    expect(total, `${path}: ${sources.join("; ")}`).toBeLessThanOrEqual(CLS_BOUND);
  }
});

/**
The entry bundle's ratchet, like the tap-latency ceilings (`CEILINGS` in latency.e2e.ts): the spec's
budget is 450 kB gzipped; until bundle splitting lands the ceiling holds what there is. How a later
task lowers it: build fresh, run this test, take the measured size from its annotation, multiply by
1.03 and round up to 10 kB; a lower number replaces the ceiling (never a higher one). Once within the
budget, the ceiling goes and the budget is asserted itself.
*/
const BUNDLE = {
  budgetKb: 450,
  // Measured 2026-11-11 on the design-overhaul-C build: 955.5 kB gzipped (entry + theme-boot).
  ceilingKb: 990,
  owner: "follow-up: bundle splitting",
  why: "one entry script carries every screen, the kit and core",
} as const;

/** Where a size stands against the budget, for the annotation. */
const againstBudget = (totalKb: number): string => {
  const gap = Math.round((totalKb - BUNDLE.budgetKb) * 10) / 10;
  const budget = `the ${String(BUNDLE.budgetKb)} kB budget`;
  return gap > 0 ? `${String(gap)} kB over ${budget}` : `within ${budget}: delete the ceiling`;
};

test("the scripts the page loads first stay under the bundle ceiling (spec budget 450 kB gzipped)", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  const sources = html
    .matchAll(/<script[^>]*\ssrc="([^"]+)"/gu)
    .map((match) => match[1] ?? "")
    .toArray();
  expect(sources.length).toBeGreaterThan(0);
  const sizes: Record<string, number> = {};
  for (const source of sources) {
    const body = await (await request.get(source)).body();
    sizes[source] = gzipSync(body).length;
  }
  const totalKb = Math.round(Object.values(sizes).reduce((sum, size) => sum + size, 0) / 100) / 10;
  const where = againstBudget(totalKb);
  test.info().annotations.push({
    description: `entry scripts ${String(totalKb)} kB gzipped (${JSON.stringify(sizes)}), ${where} (ceiling ${String(BUNDLE.ceilingKb)} kB); ${BUNDLE.owner}: ${BUNDLE.why}`,
    type: "over budget",
  });
  expect(totalKb).toBeLessThanOrEqual(BUNDLE.ceilingKb);
});
