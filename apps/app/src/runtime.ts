import {
  checkInstance,
  type Clock,
  createPaceClient,
  type EventStore,
  type InstanceError,
  type PaceClient,
  type SessionStore,
} from "@pace/client";
import { type AppHooks, createAppHooks } from "@pace/client/react";
import { CLIENT_OUTDATED, type Instance, type Result } from "@pace/core";

import { loadDeviceId } from "./platform/device-id.ts";
import { IS_PHONE } from "./platform/device.ts";
import { createEventStore } from "./platform/event-store.ts";
import { createSecureSessionStore } from "./platform/secure-session.ts";
import { markClientOutdated } from "./platform/server-store.ts";
import { readServer } from "./platform/server.ts";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Everything the screens need, wired once per app launch and again for another server. */
export type PaceRuntime = PaceClient & {
  readonly hooks: AppHooks;
  readonly deviceId: string;
  /** The server this runtime talks to; a server switch builds a new runtime. */
  readonly baseUrl: string;
  /** What this server says about itself and whether it fits this app (`GET /api/instance`). */
  readonly checkInstance: () => Promise<Result<Instance, InstanceError>>;
  /** Drops the local log (on logout) and rebuilds the empty state. */
  readonly resetLocalData: () => Promise<void>;
};

export type RuntimeOptions = {
  readonly baseUrl?: string;
  /** Defaults to the system clock; tests freeze it at the artboard instant. */
  readonly clock?: Clock;
  readonly deviceId?: () => Promise<string>;
  readonly eventStore?: EventStore;
  readonly fetch?: FetchLike;
  readonly now?: () => string;
  readonly session?: SessionStore;
};

/** Whether a refused call is the server turning away this app as too old (426 `client/outdated`). */
const isClientOutdated = async (response: Response): Promise<boolean> => {
  if (response.status !== 426) {
    return false;
  }
  try {
    const body: unknown = await response.clone().json();
    return (
      typeof body === "object" && body !== null && "code" in body && body.code === CLIENT_OUTDATED
    );
  } catch {
    return false;
  }
};

/** Every call of the runtime, watched for the server refusing this app as too old. */
const watchingProtocol =
  (fetchOf: FetchLike, origin: string): FetchLike =>
  async (input, init) => {
    const response = await fetchOf(input, init);
    if (await isClientOutdated(response)) {
      markClientOutdated(origin);
    }
    return response;
  };

/** Builds the client stack on the platform adapters; options override them (tests). */
export const createRuntime = async (options: RuntimeOptions = {}): Promise<PaceRuntime> => {
  const eventStore = options.eventStore ?? createEventStore();
  const deviceId = await (options.deviceId ?? loadDeviceId)();
  const baseUrl = options.baseUrl ?? (await readServer());
  const fetchOf: FetchLike = options.fetch ?? (async (input, init) => await fetch(input, init));
  const watched = watchingProtocol(fetchOf, baseUrl);
  const client = createPaceClient({
    baseUrl,
    ...(options.clock !== undefined && { clock: options.clock }),
    deviceId,
    fetch: watched,
    ...(options.now !== undefined && { now: options.now }),
    session: options.session ?? createSecureSessionStore(baseUrl),
    // The event log tells which shell a change came from.
    source: IS_PHONE ? "app" : "web",
    store: eventStore,
  });
  return {
    ...client,
    baseUrl,
    checkInstance: async () => await checkInstance(baseUrl, watched),
    deviceId,
    hooks: createAppHooks(client.state, client.clock),
    resetLocalData: async () => {
      // Through the log's write queue: a write still waiting must not land in the wiped store.
      await client.state.clear();
    },
  };
};
