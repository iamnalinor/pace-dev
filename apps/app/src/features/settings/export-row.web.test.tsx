import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { Event } from "@pace/core";

import { ExportRow } from "#app/features/settings/export-row.web.tsx";
import { baseEvent, checkpointFixture } from "#app/platform/checkpoint-store-contract.fake.ts";
import { downloadXlsx } from "#app/platform/xlsx.web.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { createMemoryEventStore } from "@pace/client";
import { problem } from "@pace/client/testing";

jest.mock("#app/platform/xlsx.web.ts", () => ({ downloadXlsx: jest.fn(async () => undefined) }));
const download = jest.mocked(downloadXlsx);

beforeEach(() => {
  download.mockClear();
});

it("waits for a fresh complete history before building export rows", async () => {
  const held = Promise.withResolvers<unknown>();
  const disk = createMemoryEventStore();
  const revocation: Event = {
    ...baseEvent,
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAD",
    type: "event.revoked",
    occurredAt: "2026-10-06T10:00:00.000Z",
    payload: { targetId: baseEvent.id },
  };
  const sourceRecords = [
    { seq: 1, event: baseEvent },
    { seq: 2, event: revocation },
  ];
  await disk.installBootstrap({
    guard: await disk.readSnapshot(),
    checkpoint: await checkpointFixture("store-a", sourceRecords),
    records: [],
    seq: 2,
    syncVersion: 2,
  });
  const runtime = await createTestRuntime({
    world: "empty",
    eventStore: disk,
    routes: { "GET /api/sync/pull": async () => await held.promise },
  });
  await renderScreen(<ExportRow />, runtime);
  await act(async () => {
    void fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
  });
  expect(download).not.toHaveBeenCalled();
  await act(async () => {
    held.resolve({
      storeId: "store-a",
      seq: 2,
      more: false,
      events: [baseEvent, revocation],
      records: sourceRecords,
    });
  });
  await waitFor(() => {
    expect(download).toHaveBeenCalledTimes(1);
  });
  const eventRows = download.mock.calls[0]?.[0].find((sheet) => sheet.name === "events");
  expect(eventRows?.rows.some((row) => row.includes(baseEvent.id))).toBe(true);
  expect(
    eventRows?.rows.some((row) => row.includes(revocation.id) && row.includes("event.revoked")),
  ).toBe(true);
});

it("catches a rejected download, clears busy, and permits another attempt", async () => {
  download.mockRejectedValueOnce(new Error("download failed"));
  const runtime = await createTestRuntime();
  await renderScreen(<ExportRow />, runtime);
  await fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
  await waitFor(() => {
    expect(screen.getByText("Could not download the export. Try again.")).toBeOnTheScreen();
  });
  expect(screen.getByRole("button", { name: en("settings.export.action") })).toBeEnabled();
  await fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
  expect(download).toHaveBeenCalledTimes(2);
});

it("downloads nothing after a source failure and permits a successful retry", async () => {
  let isOnline = false;
  const disk = createMemoryEventStore();
  await disk.installBootstrap({
    guard: await disk.readSnapshot(),
    checkpoint: await checkpointFixture(),
    records: [],
    seq: 1,
    syncVersion: 2,
  });
  const runtime = await createTestRuntime({
    world: "empty",
    eventStore: disk,
    routes: {
      "GET /api/sync/pull": () => {
        if (!isOnline) {
          throw new TypeError("offline");
        }
        return {
          storeId: "store-a",
          seq: 1,
          more: false,
          events: [baseEvent],
          records: [{ seq: 1, event: baseEvent }],
        };
      },
    },
  });
  await renderScreen(<ExportRow />, runtime);
  await fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
  await waitFor(() => {
    expect(screen.getByText(en("actionError.history/offline"))).toBeOnTheScreen();
  });
  expect(download).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: en("settings.export.action") })).toBeEnabled();
  isOnline = true;
  await fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
  expect(download).toHaveBeenCalledTimes(1);
});

it("does not download another owner's copy after full-history readiness awaited", async () => {
  const runtime = await createTestRuntime();
  const held = Promise.withResolvers<Awaited<ReturnType<typeof runtime.history.ensureComplete>>>();
  const loading = jest
    .spyOn(runtime.history, "ensureComplete")
    .mockImplementationOnce(async () => await held.promise);
  await renderScreen(<ExportRow />, runtime);
  await act(async () => {
    void fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
  });
  expect(loading).toHaveBeenCalledTimes(1);
  await act(async () => {
    await runtime.state.claim("another-owner");
    held.resolve({ ok: true, value: undefined });
  });
  await waitFor(() => {
    expect(screen.getByText(en("actionError.sync/copy-changed"))).toBeOnTheScreen();
  });
  expect(download).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: en("settings.export.action") })).toBeEnabled();
});

describe("a copy that never reached the server (QA PR55-1-01)", () => {
  it.each([
    [
      "cannot reach it",
      () => {
        throw new TypeError("Failed to fetch");
      },
      "actionError.history/offline",
    ],
    ["answers with an error", () => problem(500, "internal"), "settings.export.notSynced"],
  ] as const)(
    "downloads nothing when the server %s, and says why",
    async (_name, pull, message) => {
      const runtime = await createTestRuntime({
        world: "empty",
        routes: { "GET /api/sync/pull": pull },
      });
      await renderScreen(<ExportRow />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
      expect(await screen.findByText(en(message))).toBeOnTheScreen();
      expect(download).not.toHaveBeenCalled();
      expect(screen.queryByText(/pace-.*\.xlsx/u)).toBeNull();
    },
  );

  it("loads the account first, then exports what it holds", async () => {
    const runtime = await createTestRuntime({
      world: "empty",
      routes: {
        "GET /api/sync/pull": () => ({
          events: [baseEvent],
          more: false,
          seq: 1,
          storeId: "store-a",
        }),
      },
    });
    await renderScreen(<ExportRow />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.export.action") }));
    await waitFor(() => {
      expect(download).toHaveBeenCalledTimes(1);
    });
    const eventRows = download.mock.calls[0]?.[0].find((sheet) => sheet.name === "events");
    expect(eventRows?.rows.some((row) => row.includes(baseEvent.id))).toBe(true);
  });
});

it("exports once for two presses before it turns busy (class 374)", async () => {
  await renderScreen(<ExportRow />, await createTestRuntime());
  const button = screen.getByRole("button", { name: en("settings.export.action") });
  await act(async () => {
    void fireEvent.press(button);
    void fireEvent.press(button);
  });
  await waitFor(() => {
    expect(download).toHaveBeenCalledTimes(1);
  });
});
