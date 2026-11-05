import { env } from "cloudflare:workers";
import { vi } from "vitest";

import type { UserStore } from "../src/user-store/user-store.ts";

import { coldUserStore, meterSql, type SqlCost } from "./helpers.ts";
import {
  COST_START,
  type CostOperation,
  type CostOptions,
  storageCostFixture,
} from "./storage-cost-fixture.ts";

export const measuredSql = async <T>(
  storage: DurableObjectStorage,
  operation: () => Promise<T>,
): Promise<{ readonly value: T; readonly cost: SqlCost }> => {
  const meter = meterSql(storage);
  try {
    const value = await operation();
    return { value, cost: meter.cost() };
  } finally {
    meter.restore();
  }
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonical(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
};
export const storageCostIdentity = async (value: unknown): Promise<string> => {
  const serialized = JSON.stringify(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const execute = async (store: UserStore, operation: CostOperation): Promise<void> => {
  switch (operation.kind) {
    case "append": {
      const result = await store.append(operation.input, { now: operation.now });
      if (result.rejected.length > 0 || result.accepted.length !== operation.input.length) {
        throw new Error(`Invalid workload events: ${operation.id}: ${JSON.stringify(result)}`);
      }
      return;
    }
    case "calendar": {
      await store.syncCalendar(operation.input, operation.now);
      return;
    }
    case "usage": {
      await store.addUsage(operation.input, operation.now);
    }
  }
};

export const snapshotStorageCost = async (state: DurableObjectState, now: string) => {
  const deployed = { ...env, PACE_VERSION: "storage-cost-fixture-v1" };
  const store = await coldUserStore(state, deployed);
  const read = await store.read(now);
  return {
    materialized: read.state,
    sequence: read.seq,
    events: state.storage.sql.exec("SELECT * FROM events ORDER BY seq").toArray(),
    usageKnown: Object.fromEntries(await state.storage.list({ prefix: "usage:known:" })),
    calendar: state.storage.sql
      .exec("SELECT * FROM calendar_events ORDER BY device_id, event_id, start_at")
      .toArray(),
    usage: state.storage.sql
      .exec("SELECT * FROM usage_sessions ORDER BY device_id, app, start_at")
      .toArray(),
    phoneUses: state.storage.sql
      .exec("SELECT * FROM phone_uses ORDER BY device_id, start_at")
      .toArray(),
  };
};

/** Local SQL observations only. Runtime-created initial migration happens before this callback. */
export const runStorageCost = async (state: DurableObjectState, options: CostOptions) => {
  type Measurement = {
    readonly id: string;
    readonly phase: string;
    readonly inputIdentity: string;
    readonly initialization: SqlCost;
    readonly operation: SqlCost;
    readonly databaseBytes: number;
  };
  const operations = storageCostFixture(options);
  const measurements: Measurement[] = [];
  const deployed = { ...env, PACE_VERSION: "storage-cost-fixture-v1" };
  for (const operation of operations) {
    vi.setSystemTime(new Date(operation.now));
    const initialization = await measuredSql(
      state.storage,
      async () => await coldUserStore(state, deployed),
    );
    const measured = await measuredSql(state.storage, async () => {
      await execute(initialization.value, operation);
    });
    measurements.push({
      id: operation.id,
      phase: operation.phase,
      inputIdentity: await storageCostIdentity(operation),
      initialization: initialization.cost,
      operation: measured.cost,
      databaseBytes: state.storage.sql.databaseSize,
    });
  }
  const now = operations.at(-1)?.now ?? COST_START;
  const inspection = await measuredSql(
    state.storage,
    async () => await snapshotStorageCost(state, now),
  );
  return {
    fixtureVersion: 1,
    identityVersion: 2,
    options,
    excludedWorkloads: ["scheduled alarms and background alarm delivery"],
    bootstrap:
      "runtime initial creation/migrations excluded; each subsequent cold initialization measured separately",
    inputIdentity: await storageCostIdentity(operations),
    finalIdentity: await storageCostIdentity(inspection.value),
    taskCount: Object.keys(inspection.value.materialized.tasks.byId).length,
    operationCount: operations.length,
    measurements,
    inspection: inspection.cost,
  };
};
