import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

/**
The motion spec (redesign-spec §6) on the web build, read frame by frame: the check-off, a sheet,
a dialog and a route push. A frame sampler runs in the page (`requestAnimationFrame`) and records
the box, the opacity and the scale of one element, so a test sees what was drawn in between, not
only where things ended.
*/

const TASKS = ["Send the invoice", "Review the pull request", "Plan the sprint", "Call the bank"];

/** An English account with four open tasks; answers their ids. */
const seed = async (token: string): Promise<readonly string[]> => {
  const now = Date.now();
  const at = (offset: number): string => new Date(now - 90_000 + offset * 1000).toISOString();
  const taskIds = TASKS.map((_title, index) => ulid(now - 80_000 + index));
  const bodies = [
    { payload: { language: "en", timezone: "UTC" }, type: "settings.updated" },
    ...TASKS.map((title, index) => ({
      payload: { presetId: "personal", taskId: taskIds[index], title },
      type: "task.created",
    })),
  ];
  const events = bodies.map((body, index) => ({
    ...body,
    deviceId: "e2e-seed",
    id: ulid(now - 70_000 + index),
    occurredAt: at(index),
    precision: "exact",
    recordedAt: at(index),
    source: "web",
  }));
  const response = await pushAsClient(token, events);
  expect(response.ok).toBe(true);
  return taskIds;
};

type Frame = {
  /** Milliseconds since the sampler started. */
  readonly at: number;
  /** Whether the element is in the page and takes part in layout. */
  readonly isThere: boolean;
  readonly top: number;
  readonly left: number;
  readonly height: number;
  /** The ink's opacity (the element's, or the one inside it the test names) times its ancestors'. */
  readonly opacity: number;
  /** The horizontal scale of the element's transform times its ancestors' (a wrapper may carry it). */
  readonly scale: number;
};

/**
Starts recording the first element matching `selector`, every frame, into the page. `ink` names an
element inside it whose opacity is read instead (a fade on a child of the sampled box).
*/
const startSampling = async (page: Page, selector: string, ink?: string): Promise<void> => {
  await page.evaluate(
    ([query, inkQuery]) => {
      const frames: Frame[] = [];
      const started = performance.now();
      const state = { isOn: true };
      const {
        DOMMatrixReadOnly: Matrix,
        document,
        getComputedStyle,
        requestAnimationFrame,
      } = globalThis;
      /** What `read` answers for an element, times what it answers for each of its ancestors. */
      const upward = (element: Element, read: (style: CSSStyleDeclaration) => number): number => {
        let product = 1;
        for (let node: Element | null = element; node !== null; node = node.parentElement) {
          product *= read(getComputedStyle(node));
        }
        return product;
      };
      const opacityOf = (element: Element): number =>
        upward(element, (style) => Number(style.opacity));
      const scaleOf = (element: Element): number =>
        upward(element, ({ transform }) => (transform === "none" ? 1 : new Matrix(transform).a));
      const sample = (): void => {
        if (!state.isOn) {
          return;
        }
        const element = document.querySelector(query);
        const inked = inkQuery === undefined ? element : element?.querySelector(inkQuery);
        const at = performance.now() - started;
        if (element === null || inked === null || inked === undefined) {
          frames.push({ at, height: 0, isThere: false, left: 0, opacity: 0, scale: 1, top: 0 });
        } else {
          const box = element.getBoundingClientRect();
          frames.push({
            at,
            height: box.height,
            isThere: box.width > 0 || box.height > 0,
            left: box.left,
            opacity: opacityOf(inked),
            scale: scaleOf(element),
            top: box.top,
          });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      Object.assign(globalThis, {
        paceFrames: () => {
          state.isOn = false;
          return frames;
        },
        paceStill: (window: number) => {
          const last = frames.at(-1);
          const recent = frames.filter((frame) => frame.at >= (last?.at ?? 0) - window);
          return (
            last !== undefined &&
            last.isThere &&
            last.at - (recent[0]?.at ?? last.at) >= window * 0.8 &&
            recent.every(
              (frame) =>
                frame.isThere &&
                Math.abs(frame.top - last.top) < 0.5 &&
                Math.abs(frame.left - last.left) < 0.5 &&
                Math.abs(frame.opacity - last.opacity) < 0.005 &&
                Math.abs(frame.scale - last.scale) < 0.0005,
            )
          );
        },
      });
    },
    [selector, ink] as const,
  );
};

/** Waits until the sampled element has stood still (box, opacity, scale) for 100 ms. */
const waitForStill = async (page: Page): Promise<void> => {
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          (globalThis as unknown as { paceStill: (window: number) => boolean }).paceStill(100),
        ),
    )
    .toBe(true);
};

/** Stops the sampler and answers what it saw. */
const stopSampling = async (page: Page): Promise<readonly Frame[]> =>
  await page.evaluate(() => (globalThis as unknown as { paceFrames: () => Frame[] }).paceFrames());

/** The distinct values a number took strictly between its first and its last one. */
const between = (values: readonly number[]): readonly number[] => {
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const low = Math.min(first, last);
  const high = Math.max(first, last);
  return [...new Set(values.map((value) => Math.round(value * 100) / 100))].filter(
    (value) => value > low + 0.01 && value < high - 0.01,
  );
};

const openNow = async (page: Page): Promise<void> => {
  const { token } = await loginViaApi(page);
  await seed(token);
  await page.goto("/");
  await expect(page.getByRole("checkbox", { name: `Mark ${TASKS[0] ?? ""} done` })).toBeVisible();
};

/** Marks the list item that holds a task's check, and the one after it, for the sampler. */
const markRows = async (page: Page, title: string): Promise<void> => {
  await page
    .getByRole("listitem")
    .filter({ has: page.getByRole("checkbox", { name: `Mark ${title} done` }) })
    .evaluate((row) => {
      Object.assign(row.dataset, { motionRow: "checked" });
      const next = row.nextElementSibling?.nextElementSibling ?? row.nextElementSibling;
      if (next instanceof HTMLElement) {
        Object.assign(next.dataset, { motionRow: "below" });
      }
    });
};

test.describe("check-off (spec §6: fade 160, close-up 220, on completion)", () => {
  test("the rows below move up over several frames, on the web as on Android (F-MOT-02)", async ({
    page,
  }) => {
    await openNow(page);
    await markRows(page, TASKS[1] ?? "");
    await startSampling(page, '[data-motion-row="below"]');
    await page.getByRole("checkbox", { name: `Mark ${TASKS[1] ?? ""} done` }).click();
    await expect(page.getByRole("checkbox", { name: `Mark ${TASKS[1] ?? ""} done` })).toHaveCount(
      0,
    );
    const frames = (await stopSampling(page)).filter((frame) => frame.isThere);
    const tops = frames.map((frame) => frame.top);
    expect((tops[0] ?? 0) - (tops.at(-1) ?? 0), "the row below moved up").toBeGreaterThan(20);
    expect(between(tops).length, "positions in between").toBeGreaterThanOrEqual(3);
    // Never back down: one continuous move.
    for (const [index, top] of tops.entries()) {
      expect(top).toBeLessThanOrEqual((tops[index - 1] ?? top) + 0.5);
    }
  });

  test("the checked row fades while it closes up and is gone well inside a second (F-MOT-01)", async ({
    page,
  }) => {
    await openNow(page);
    await markRows(page, TASKS[1] ?? "");
    await startSampling(page, '[data-motion-row="checked"] [role="checkbox"]');
    const pressedAt = await page.evaluate(() => performance.now());
    await page.getByRole("checkbox", { name: `Mark ${TASKS[1] ?? ""} done` }).click();
    await expect(page.getByRole("checkbox", { name: `Mark ${TASKS[1] ?? ""} done` })).toHaveCount(
      0,
    );
    const goneAt = await page.evaluate(() => performance.now());
    expect(goneAt - pressedAt).toBeLessThan(1000);
    const frames = await stopSampling(page);
    expect(between(frames.map((frame) => frame.opacity)).length).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("reduced motion: the row fades and goes, never a blank hole that keeps its place (F-MOT-03)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openNow(page);
    await markRows(page, TASKS[1] ?? "");
    // The row's box, and the opacity of what is drawn in it (the fade is on a child of the item).
    await startSampling(page, '[data-motion-row="checked"]', '[role="checkbox"]');
    await page.getByRole("checkbox", { name: `Mark ${TASKS[1] ?? ""} done` }).click();
    await expect(page.getByRole("checkbox", { name: `Mark ${TASKS[1] ?? ""} done` })).toHaveCount(
      0,
    );
    const frames = await stopSampling(page);
    // The fade still shows the change (never zero)…
    expect(between(frames.map((frame) => frame.opacity)).length).toBeGreaterThanOrEqual(2);
    // …and once the content is gone the row lets go of its place within a few frames.
    const blank = frames.filter(
      (frame) => frame.isThere && frame.opacity < 0.02 && frame.height > 8,
    );
    // No blank frame at all: both ends read 0.
    const span = (blank.at(-1)?.at ?? 0) - (blank[0]?.at ?? 0);
    expect(span, "time a blank row kept its place").toBeLessThan(120);
  });
});

const SURFACE = '[data-pace-surface="sheet"]';

test.describe("overlays (spec §6: paired enter and exit)", () => {
  test.describe("a phone's sheet", () => {
    test.use({ viewport: { height: 844, width: 390 } });

    test("slides in from its own height and slides out again, with frames in between", async ({
      page,
    }) => {
      const { token } = await loginViaApi(page);
      await seed(token);
      await page.goto("/day");
      const opener = page.getByRole("button", { name: "Log past activity" });
      await expect(opener).toBeVisible();
      await startSampling(page, SURFACE);
      await opener.click();
      await expect(page.locator(SURFACE)).toBeVisible();
      await waitForStill(page);
      const opening = (await stopSampling(page)).filter((frame) => frame.isThere);
      expect(between(opening.map((frame) => frame.top)).length).toBeGreaterThanOrEqual(3);

      await startSampling(page, SURFACE);
      await page.keyboard.press("Escape");
      await expect(page.locator(SURFACE)).toHaveCount(0);
      const closing = (await stopSampling(page)).filter((frame) => frame.isThere);
      expect(between(closing.map((frame) => frame.top)).length).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe("a computer's dialog", () => {
    test.use({ viewport: { height: 900, width: 1280 } });

    test("never grows from nothing: its first frame is at 95 % or more (F-MOT-06)", async ({
      page,
    }) => {
      const { token } = await loginViaApi(page);
      const [taskId = ""] = await seed(token);
      // A computer edits a task in a dialog (Day's Log past activity is an inspector pane there).
      await page.goto(`/task/${taskId}`);
      const opener = page.getByRole("button", { exact: true, name: "Edit" });
      await expect(opener).toBeVisible();
      await startSampling(page, SURFACE);
      await opener.click();
      await expect(page.getByRole("dialog").locator(SURFACE)).toBeVisible();
      await waitForStill(page);
      const frames = (await stopSampling(page)).filter((frame) => frame.isThere);
      expect(frames.length).toBeGreaterThan(3);
      expect(frames.at(-1)?.scale, "it ends at its own size").toBeCloseTo(1, 3);
      for (const frame of frames) {
        expect(frame.scale).toBeGreaterThanOrEqual(0.95);
      }
      expect(between(frames.map((frame) => frame.opacity)).length).toBeGreaterThanOrEqual(2);
    });
  });
});

test.describe("route push on the web (spec §6: 12 px slide and fade)", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("a pushed screen slides in over several frames; a tab switch does not move", async ({
    page,
  }) => {
    await openNow(page);
    await startSampling(page, '[data-pace-route="in"]');
    await page.getByRole("link", { name: TASKS[0] ?? "" }).click();
    await expect(page).toHaveURL(/\/task\//u);
    // Played once: the mark goes when the animation ends, so nothing on screen replays it.
    await expect(page.locator("[data-pace-route]:visible")).toHaveCount(0);
    const pushed = (await stopSampling(page)).filter((frame) => frame.isThere);
    expect(between(pushed.map((frame) => frame.left)).length).toBeGreaterThanOrEqual(3);
    expect(between(pushed.map((frame) => frame.opacity)).length).toBeGreaterThanOrEqual(3);
    // The screen underneath, out of the page, waits to come back from the other side.
    await expect(page.locator('[data-pace-route="back"]')).toHaveCount(1);
    await expect(page.locator('[data-pace-route="back"]')).toBeHidden();

    await startSampling(page, '[data-pace-route="back"]');
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
    // It came back once, and no mark is left anywhere to replay.
    await expect(page.locator("[data-pace-route]")).toHaveCount(0);
    const back = (await stopSampling(page)).filter((frame) => frame.isThere);
    expect(between(back.map((frame) => frame.opacity)).length).toBeGreaterThanOrEqual(2);
    await startSampling(page, "main");
    await page.getByRole("link", { name: "Day" }).click();
    await expect(page.getByRole("heading", { name: "Day" })).toBeVisible();
    // Long enough after the switch for a fade, had there been one, to show.
    await waitForStill(page);
    const tab = await stopSampling(page);
    expect(between(tab.map((frame) => frame.opacity))).toEqual([]);
    await expect(page.locator("[data-pace-route]")).toHaveCount(0);
  });

  test("reduced motion: the pushed screen fades and does not travel", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openNow(page);
    await startSampling(page, '[data-pace-route="in"]');
    await page.getByRole("link", { name: TASKS[0] ?? "" }).click();
    await expect(page).toHaveURL(/\/task\//u);
    await expect(page.locator("[data-pace-route]:visible")).toHaveCount(0);
    const pushed = (await stopSampling(page)).filter((frame) => frame.isThere);
    expect(between(pushed.map((frame) => frame.left))).toEqual([]);
    expect(between(pushed.map((frame) => frame.opacity)).length).toBeGreaterThanOrEqual(2);
  });
});
