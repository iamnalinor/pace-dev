import { describe, expect, it } from "vitest";

import { INITIAL_CORE_STATE, type Series } from "@pace/core";

import { toRpcState } from "./state.ts";

const series = (id: string, overrides: Readonly<Record<string, unknown>>): Series => ({
  archived: false,
  createdAt: "2026-10-16T08:00:00.000Z",
  id,
  revision: 0,
  revisionKey: "0",
  keepTaskId: null,
  schedule: { kind: "daily" },
  template: {
    fields: {},
    overrides,
    presetId: "personal",
    seriesId: id,
    seriesRevision: 0,
    startAt: "2026-10-16T08:00:00.000Z",
    startTz: "UTC",
    subtasks: [],
    taskId: `rep:${id}:0:0`,
    title: "Take medicine",
  },
});

describe("Durable Object RPC state", () => {
  it("keeps valid series overrides and removes invalid opaque values", () => {
    const state = {
      ...INITIAL_CORE_STATE,
      series: {
        byId: {
          valid: series("valid", { deadlinePolicy: { kind: "hard" } }),
          invalid: series("invalid", { unexpected: new Map([["key", "value"]]) }),
        },
      },
    };

    const rpc = toRpcState(state);
    expect(rpc.series.byId["valid"]?.template.overrides).toEqual({
      deadlinePolicy: { kind: "hard" },
    });
    expect(rpc.series.byId["invalid"]?.template).not.toHaveProperty("overrides");
  });
});
