import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

const FUTURE_TASKS = 1050;
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
    const response = await pushAsClient(token, envelopes);
    expect(response.ok).toBe(true);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    const fold = page.getByRole("button", { name: /^(In future|В будущем)/u });
    await expect(fold).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      const frames: number[] = [];
      let last = performance.now();
      const tick = (at: number): void => {
        frames.push(at - last);
        last = at;
        globalThis.requestAnimationFrame(tick);
      };
      globalThis.requestAnimationFrame(tick);
      Object.assign(globalThis, { __frames: frames });
    });
    const started = Date.now();
    await fold.click();
    await expect(page.getByText("Later task 0", { exact: true })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(500);
    const frames = await page.evaluate(
      () => (globalThis as unknown as { __frames: number[] }).__frames,
    );
    const sorted = frames.toSorted((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toBeLessThan(32);
  });
});
