import type { Sha256Text } from "./checkpoint-validation.ts";
import type { Clock } from "./clock.ts";
import type { EventStore } from "./event-store.ts";
import type { SocketLike } from "./live.ts";
import type { PeerTabs } from "./peer-tabs.ts";
import type { EndedSessionStore, SessionStore, SignOutNotes } from "./session.ts";

export type PaceClientOptions = {
  readonly baseUrl: string;
  readonly sha256Text?: Sha256Text;
  /** Refuse late authentication results after the host retires this client. */
  readonly canSignIn?: (() => boolean) | undefined;
  /** Defaults to the system clock; tests pass a frozen one. */
  readonly clock?: Clock;
  readonly deviceId: string;
  /** Defaults to the global `fetch`; tests pass a fake. */
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Defaults to the clock's `now`. */
  readonly now?: () => string;
  /** The other tabs sharing this store (a browser profile's), told of every change to it. */
  readonly peers?: PeerTabs | undefined;
  readonly session: SessionStore;
  /** The log-outs the server has not heard yet, kept between starts (R22-02); in memory when absent. */
  readonly endedSessions?: EndedSessionStore | undefined;
  /** The note a tab that logs out leaves the other tabs of its browser profile (the web only). */
  readonly signOutNotes?: SignOutNotes | undefined;
  readonly source: "app" | "web";
  readonly store: EventStore;
  /** Defaults to the global `WebSocket`; tests pass a fake. */
  readonly createSocket?: (url: string, protocols: readonly string[]) => SocketLike;
};
