import { sha256Text } from "#app/platform/sha256-text.ts";
import {
  checkInstanceWith,
  type Clock,
  createPaceClient,
  type EventStore,
  type InstanceError,
  type PaceClient,
  type PaceClientOptions,
  type SessionStore,
  type Sha256Text,
} from "@pace/client";
import { type AppHooks, createAppHooks } from "@pace/client/react";
import {
  CLIENT_OUTDATED,
  FirebaseConfigReasonSchema,
  type Instance,
  type Result,
} from "@pace/core";

import { loadDeviceId } from "./platform/device-id.ts";
import { IS_PHONE } from "./platform/device.ts";
import { createEventStore, type LocalEventStore } from "./platform/event-store.ts";
import { createPeerTabs } from "./platform/peer-tabs.ts";
import {
  createSecureEndedSessionStore,
  createSecureSessionStore,
} from "./platform/secure-session.ts";
import { applyInstanceCheck, markClientOutdated } from "./platform/server-store.ts";
import { canUseCurrentServer } from "./platform/server-switch-state.ts";
import { readServer } from "./platform/server.ts";
import { createSignOutNotes } from "./platform/sign-out-notes.ts";

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
  readonly sha256Text?: Sha256Text;
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

const observeConfiguration = async (response: Response, origin: string): Promise<void> => {
  if (response.status !== 500) {
    return;
  }
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return;
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("code" in body) ||
    body.code !== "server/misconfigured"
  ) {
    return;
  }
  const reason = FirebaseConfigReasonSchema.safeParse("reason" in body ? body.reason : null);
  applyInstanceCheck(origin, {
    ok: false,
    error: { kind: "server-misconfigured", reason: reason.success ? reason.data : null },
  });
};

/** Every call of the runtime, watched for the server refusing this app as too old. */
const watchingProtocol =
  (fetchOf: FetchLike, origin: string): FetchLike =>
  async (input, init) => {
    const response = await fetchOf(input, init);
    if (await isClientOutdated(response)) {
      markClientOutdated(origin);
    }
    await observeConfiguration(response, origin);
    return response;
  };

/**
Where the session is kept, with the note a tab that logs out leaves the profile's other tabs; a
store a test hands in is nobody else's, so it shares no note.
*/
const sessionOf = (
  provided: SessionStore | undefined,
  baseUrl: string,
): Pick<PaceClientOptions, "endedSessions" | "session" | "signOutNotes"> =>
  provided === undefined
    ? {
        endedSessions: createSecureEndedSessionStore(baseUrl),
        session: createSecureSessionStore(baseUrl),
        signOutNotes: createSignOutNotes(),
      }
    : { endedSessions: undefined, session: provided, signOutNotes: undefined };

/** Builds the client stack on the platform adapters; options override them (tests). */
export const createRuntime = async (options: RuntimeOptions = {}): Promise<PaceRuntime> => {
  const hash = options.sha256Text ?? sha256Text;
  // A store a test hands in is nobody else's.
  const local: LocalEventStore =
    options.eventStore === undefined
      ? createEventStore(hash)
      : { isShared: () => Promise.resolve(false), store: options.eventStore };
  const eventStore = local.store;
  const deviceId = await (options.deviceId ?? loadDeviceId)();
  const baseUrl = options.baseUrl ?? (await readServer());
  const fetchOf: FetchLike = options.fetch ?? (async (input, init) => await fetch(input, init));
  const watched = watchingProtocol(fetchOf, baseUrl);
  const client = createPaceClient({
    baseUrl,
    canSignIn: canUseCurrentServer,
    ...(options.clock !== undefined && { clock: options.clock }),
    deviceId,
    fetch: watched,
    ...(options.now !== undefined && { now: options.now }),
    peers: createPeerTabs(local.isShared),
    ...sessionOf(options.session, baseUrl),
    // The event log tells which shell a change came from.
    source: IS_PHONE ? "app" : "web",
    store: eventStore,
    sha256Text: hash,
  });
  return {
    ...client,
    baseUrl,
    checkInstance: async () => await checkInstanceWith(client.instance.read),
    deviceId,
    hooks: createAppHooks(client.state, client.clock, client.history),
    resetLocalData: async () => {
      // Through the log's write queue: a write still waiting must not land in the wiped store.
      await client.state.clear();
    },
  };
};
