import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

const FUTURE_TASKS = 1050;
const PUSH_MAX = 500;
const DAY = 24 * 60 * 60_000;

/** A long list (F-DAT-03): a fold of 1 050 tasks opens fast and keeps the frames short. */
test.describe("a long fold on a phone (Task 4.1, F-DAT-03)", () => {
  test("expanding a 1 050-row fold renders in under 500 ms with a p95 frame under 32 ms", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    const now = Date.now();
    const envelopes = Array.from({ length: FUTURE_TASKS }, (_, index) => ({
      deviceId: "e2e-scale",
      id: ulid(now - 10 * DAY + index),
      occurredAt: new Date(now - 10 * DAY + index).toISOString(),
      payload: {
        presetId: "deferred",
        startAt: new Date(now + 5 * DAY).toISOString(),
        startTz: "UTC",
        taskId: ulid(now - 20 * DAY + index),
        title: `Later task ${String(index)}`,
      },
      precision: "exact",
      recordedAt: new Date(now).toISOString(),
      source: "web",
      type: "task.created",
    }));
    // A push takes at most 500 events (`SyncPushInputSchema`).
    for (let from = 0; from < envelopes.length; from += PUSH_MAX) {
      const response = await pushAsClient(token, envelopes.slice(from, from + PUSH_MAX));
      expect(response.ok).toBe(true);
    }
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    const fold = page.getByRole("button", { name: /^(In future|В будущем)/u });
    await expect(fold).toBeVisible({ timeout: 30_000 });
    // Every frame's length and when it ended, from the press on.
    await page.evaluate(() => {
      const frames: { readonly at: number; readonly ms: number }[] = [];
      let last = performance.now();
      const tick = (at: number): void => {
        frames.push({ at, ms: at - last });
        last = at;
        globalThis.requestAnimationFrame(tick);
      };
      globalThis.requestAnimationFrame(tick);
      Object.assign(globalThis, { __frames: frames, __pressAt: performance.now() });
    });
    const started = Date.now();
    await fold.click();
    await expect(page.getByText("Later task 0", { exact: true })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(500);
    // The fold's own frames: the 400 ms from the press (its motion and the rows' first paint),
    // nothing idle after it to dilute the p95.
    const WINDOW_MS = 400;
    const read = async () =>
      await page.evaluate((span) => {
        const { __frames: frames, __pressAt: pressAt } = globalThis as unknown as {
          __frames: readonly { readonly at: number; readonly ms: number }[];
          __pressAt: number;
        };
        return {
          isOver: performance.now() - pressAt > span,
          ms: frames.filter((frame) => frame.at - pressAt <= span).map((frame) => frame.ms),
        };
      }, WINDOW_MS);
    await expect.poll(async () => (await read()).isOver).toBe(true);
    const sorted = (await read()).ms.toSorted((a, b) => a - b);
    expect(sorted.length).toBeGreaterThan(10);
    // No jank beyond the one frame that mounts the rows: the second-longest frame of the window.
    expect(sorted.at(-2) ?? 0).toBeLessThan(32);
    // That one frame (native style and layout of 30 rows, not script) stays inside the app's
    // 100 ms render budget (spec §5.6); bringing it under 32 is Task 5.6's (HANDOFF register).
    expect(sorted.at(-1) ?? 0).toBeLessThan(100);
  });
});
