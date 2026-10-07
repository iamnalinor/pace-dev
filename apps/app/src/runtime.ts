import {
  type Clock,
  createPaceClient,
  type EventStore,
  type PaceClient,
  type SessionStore,
} from "@pace/client";
import { type AppHooks, createAppHooks } from "@pace/client/react";

import { API_BASE_URL } from "./platform/api-base.ts";
import { loadDeviceId } from "./platform/device-id.ts";
import { createSecureSessionStore } from "./platform/secure-session.ts";
import { createSqliteEventStore } from "./platform/sqlite-event-store.ts";

/** Everything the screens need, wired once per app launch. */
export type PaceRuntime = PaceClient & {
  readonly hooks: AppHooks;
  readonly deviceId: string;
  /** Drops the local log (on logout) and rebuilds the empty state. */
  readonly resetLocalData: () => Promise<void>;
};

export type RuntimeOptions = {
  readonly baseUrl?: string;
  /** Defaults to the system clock; tests freeze it at the artboard instant. */
  readonly clock?: Clock;
  readonly deviceId?: () => Promise<string>;
  readonly eventStore?: EventStore;
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
  readonly now?: () => string;
  readonly session?: SessionStore;
};

/** Builds the client stack on the platform adapters; options override them (tests). */
export const createRuntime = async (options: RuntimeOptions = {}): Promise<PaceRuntime> => {
  const eventStore = options.eventStore ?? createSqliteEventStore();
  const deviceId = await (options.deviceId ?? loadDeviceId)();
  const client = createPaceClient({
    baseUrl: options.baseUrl ?? API_BASE_URL,
    ...(options.clock !== undefined && { clock: options.clock }),
    deviceId,
    ...(options.fetch !== undefined && { fetch: options.fetch }),
    ...(options.now !== undefined && { now: options.now }),
    session: options.session ?? createSecureSessionStore(),
    source: "app",
    store: eventStore,
  });
  return {
    ...client,
    deviceId,
    hooks: createAppHooks(client.state, client.clock),
    resetLocalData: async () => {
      await eventStore.clear();
      await client.state.rematerialize();
    },
  };
};
