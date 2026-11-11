import {
  exportedEventIds,
  localHistoryImage,
  preparePendingCopy,
  seedCheckpointYear,
} from "./support/checkpoint-history.ts";
import { nowTasks } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { recordSyncTraffic, repeated } from "./support/sync-traffic.ts";

// This has its own named+active local Worker run; ordinary browser coverage keeps the rollout off.
// eslint-disable-next-line playwright/no-skipped-test -- an opt-in run: an ordinary run reports it as skipped instead of not registering it
test.skip(
  process.env["PACE_E2E_CHECKPOINTS"] !== "1",
  "needs the checkpoint Worker run (PACE_E2E_CHECKPOINTS=1)",
);

test("boots year-old projections, keeps the offline outbox of a copy that never pulled, and loads complete History/export once", async ({
  page,
}, testInfo) => {
  const { token } = await loginViaApi(page);
  const seed = await seedCheckpointYear(token);
  await preparePendingCopy(page, { pending: seed.pending });
  const traffic = recordSyncTraffic(page);
  await page.goto("/");
  await expect(nowTasks(page).getByText(seed.title, { exact: true })).toBeVisible();
  await expect.poll(async () => (await localHistoryImage(page)).pending).toBe(0);
  expect(traffic.calls.some((call) => call.includes("/api/sync/bootstrap"))).toBe(true);
  const initial = await localHistoryImage(page);
  expect(initial.coverage).toBe("checkpoint");
  expect(initial.ids).not.toContain(seed.events[0]?.id);
  expect(initial.ids).toContain(seed.pending.id);
  await page.reload();
  await expect(nowTasks(page).getByText(seed.title, { exact: true })).toBeVisible();
  await expect.poll(async () => (await localHistoryImage(page)).pending).toBe(0);
  // History is a virtualised list, newest first: the year-old creation sits under a year of
  // settings rows. The moment right after it puts it first (`?at=`, the History address).
  const justAfter = new Date(Date.parse(seed.createdAt) + 60_000).toISOString();
  await page.goto(`/history?at=${encodeURIComponent(justAfter)}`);
  await expect(page.getByText(`Task created · ${seed.title}`, { exact: true })).toBeVisible();
  await expect.poll(async () => (await localHistoryImage(page)).coverage).toBe("full");
  const full = await localHistoryImage(page);
  for (const event of [...seed.events, seed.pending]) {
    expect(full.ids).toContain(event.id);
  }
  const pinned = traffic.calls.filter((call) => call.includes("through="));
  expect(pinned.length).toBeGreaterThan(1);
  expect(repeated(pinned)).toEqual([]);
  await page.goto("/settings");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data", exact: true }).click();
  const file = await downloaded;
  const path = testInfo.outputPath("complete-history.xlsx");
  await file.saveAs(path);
  const ids = await exportedEventIds(file);
  for (const event of [...seed.events, seed.pending]) {
    expect(ids.filter((id) => id === event.id)).toHaveLength(1);
  }
  expect(traffic.calls.filter((call) => call.includes("through="))).toEqual(pinned);
  await expect.poll(async () => (await localHistoryImage(page)).pending).toBe(0);
  expect(await traffic.over(700)).toEqual({ calls: [], frames: [] });
});
