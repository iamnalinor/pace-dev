import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { HistoryScreen } from "#app/features/history/history-screen.tsx";
import { baseEvent, checkpointFixture } from "#app/platform/checkpoint-store-contract.fake.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { createMemoryEventStore } from "@pace/client";

const partialRuntime = async (pull: () => Promise<unknown>) => {
  const disk = createMemoryEventStore();
  await disk.installBootstrap({
    guard: await disk.readSnapshot(),
    checkpoint: await checkpointFixture(),
    records: [],
    seq: 1,
    syncVersion: 2,
  });
  return await createTestRuntime({
    world: "empty",
    eventStore: disk,
    routes: { "GET /api/sync/pull": pull },
  });
};
const source = {
  storeId: "store-a",
  seq: 1,
  more: false,
  events: [baseEvent],
  records: [{ seq: 1, event: baseEvent }],
};

describe("History source loading", () => {
  it("waits for complete source, keeps the selected day, and never shows a false empty board", async () => {
    const held = Promise.withResolvers<unknown>();
    const runtime = await partialRuntime(async () => await held.promise);
    await renderScreen(<HistoryScreen />, runtime);
    expect(screen.getByRole("progressbar", { name: en("history.loading") })).toBeOnTheScreen();
    expect(screen.queryByText(en("history.emptyAt"))).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("day.previous") }));
    await act(async () => {
      held.resolve(source);
    });
    await waitFor(() => {
      expect(screen.queryByRole("progressbar", { name: en("history.loading") })).toBeNull();
    });
    expect(screen.queryByText(en("event.settings.updated"))).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("period.today") }));
    expect(screen.getByText(en("event.settings.updated"))).toBeOnTheScreen();
  });

  it("shows a recoverable source error and retries only when requested", async () => {
    let attempts = 0;
    const runtime = await partialRuntime(async () => {
      attempts++;
      if (attempts === 1) {
        throw new TypeError("offline");
      }
      return source;
    });
    await renderScreen(<HistoryScreen />, runtime);
    await waitFor(() => {
      expect(screen.getByText(en("actionError.history/offline"))).toBeOnTheScreen();
    });
    expect(attempts).toBe(1);
    expect(screen.queryByText(en("history.emptyAt"))).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("common.retry") }));
    await waitFor(() => {
      expect(screen.getByText(en("event.settings.updated"))).toBeOnTheScreen();
    });
    expect(attempts).toBe(2);
  });
});

it("loads source once when History was mounted before a delayed bootstrap installed its base", async () => {
  const disk = createMemoryEventStore();
  let pulls = 0;
  const runtime = await createTestRuntime({
    world: "empty",
    eventStore: disk,
    routes: {
      "GET /api/sync/pull": () => {
        pulls++;
        return source;
      },
    },
  });
  await renderScreen(<HistoryScreen />, runtime);
  expect(pulls).toBe(0);
  await act(async () => {
    const result = await runtime.state.commitSnapshot(
      async () =>
        await disk.installBootstrap({
          guard: await disk.readSnapshot(),
          checkpoint: await checkpointFixture(),
          records: [],
          seq: 1,
          syncVersion: 2,
        }),
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
    await runtime.state.rematerialize();
  });
  await waitFor(() => {
    expect(screen.getByText(en("event.settings.updated"))).toBeOnTheScreen();
  });
  expect(pulls).toBe(1);
});
