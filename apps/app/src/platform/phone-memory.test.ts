import * as SecureStore from "expo-secure-store";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { dismiss, dismissedKeys, seriesRules, setSeriesRule } from "./phone-memory.ts";

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
