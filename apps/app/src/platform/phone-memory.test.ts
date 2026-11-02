import * as SecureStore from "expo-secure-store";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import {
  dismiss,
  dismissedKeys,
  seriesRules,
  setSeriesRule,
  setUsageCursor,
  usageCursor,
} from "./phone-memory.ts";

beforeEach(async () => {
  (SecureStore as unknown as FakeSecureStore).values.clear();
  await SecureStore.setItemAsync("pace.session", "session-A");
});

it("keeps dismissed prompts and calendar rules within the login that made them", async () => {
  await dismiss("calendar@private-A");
  await setSeriesRule({ rule: "skip", series: "private-A", title: "A's appointment" });
  expect(await dismissedKeys()).toContain("calendar@private-A");
  expect(await seriesRules()).toHaveLength(1);

  await SecureStore.setItemAsync("pace.session", "session-B");
  expect(await dismissedKeys()).not.toContain("calendar@private-A");
  expect(await seriesRules()).toEqual([]);
  await setSeriesRule({ rule: "attended", series: "private-B", title: "B's appointment" });

  await SecureStore.setItemAsync("pace.session", "session-A");
  expect(await seriesRules()).toEqual([
    { rule: "skip", series: "private-A", title: "A's appointment" },
  ]);
});

it("keeps the usage cursor with the lock state, and reads an older cursor as unlocked", async () => {
  await setUsageCursor("session-A", { at: "2026-10-06T05:50:00.000Z", locked: true }, () => true);
  expect(await usageCursor("session-A")).toEqual({ at: "2026-10-06T05:50:00.000Z", locked: true });
  expect(await usageCursor("session-B")).toBeNull();
  // What an app from before the lock state was kept wrote.
  await SecureStore.setItemAsync(
    "pace.phone.usageCursor",
    JSON.stringify({ session: "session-A", value: "2026-10-06T05:00:00.000Z" }),
  );
  expect(await usageCursor("session-A")).toEqual({ at: "2026-10-06T05:00:00.000Z", locked: false });
});
