import type { z } from "zod";

import type { endpoints, PoolNotification, Result, STORE_CHANGED } from "@pace/core";

import type {
  BotStoreApi,
  EventPage,
  ResolveMeta,
  UsageUpload,
  UserStoreApi,
} from "../contract.ts";
import type { PollEntry } from "../push/poll-transport.ts";

type AppendResult = {
  readonly accepted: readonly string[];
  readonly rejected: readonly { readonly id: string; readonly reason: string }[];
  readonly seq: number;
};

/** The existing typed RPC surface consumed outside the actor, independent of its host. */
export type UserStoreRpc = Omit<UserStoreApi, "list"> &
  BotStoreApi & {
    readonly storeId: () => Promise<string>;
    readonly wipe: () => Promise<void>;
    readonly fetch: (request: Request) => Promise<Response>;
    readonly endLiveSessions: (sessionId?: string, until?: number) => Promise<void>;
    readonly push: (
      storeId: string,
      events: readonly unknown[],
      options: { readonly now: string },
    ) => Promise<Result<AppendResult, typeof STORE_CHANGED>>;
    readonly list: (
      since: number,
      limit: number,
    ) => Promise<EventPage & { readonly storeId: string }>;
    readonly syncCalendar: (
      upload: z.infer<typeof endpoints.calendar.sync.body>,
      now: string,
    ) => Promise<number>;
    readonly clearCalendar: (deviceId: string) => Promise<void>;
    readonly addUsage: (upload: UsageUpload, now: string) => Promise<number>;
    readonly usageDevices: () => Promise<
      readonly { readonly deviceId: string; readonly at: string }[]
    >;
    readonly pollFor: (
      sessionId: string,
      window: { readonly after: number; readonly now: string },
    ) => Promise<{
      readonly entries: readonly (PollEntry & {
        readonly notification?: null | PoolNotification;
      })[];
      readonly cursor: number;
    }>;
    readonly listNotifications: (
      query: z.infer<typeof endpoints.notifications.list.query>,
    ) => Promise<{
      readonly items: readonly PoolNotification[];
      readonly more: boolean;
      readonly deliveries: Readonly<
        Record<
          string,
          readonly z.infer<
            typeof endpoints.notifications.list.output
          >["deliveries"][string][number][]
        >
      >;
    }>;
    readonly readNotifications: (
      which: ({ readonly all: true } | { readonly ids: readonly string[] }) & {
        readonly reader?: string | undefined;
      },
      now: string,
    ) => Promise<void>;
    readonly skipCalendarEvent: (eventKey: string, meta: ResolveMeta) => Promise<void>;
  };

/** Stable person identity selects one actor; different people have independent execution. */
export type UserStoreHost = { readonly of: (userId: string) => UserStoreRpc };
