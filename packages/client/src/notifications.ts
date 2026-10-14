import { createStore, type StoreApi } from "zustand/vanilla";

import {
  type Answer,
  type EndpointOutput,
  endpoints,
  type LiveNotice,
  LiveNoticeSchema,
  type PoolNotification,
} from "@pace/core";

import type { ApiClient } from "./api-client.ts";

/** A delivery of a notification to a device, as the server logged it. */
export type DeliveryEntry = EndpointOutput<
  typeof endpoints.notifications.list
>["deliveries"][string][number];

export type FeedState = {
  readonly status: "failed" | "idle" | "loading" | "ready";
  /** Every notification fetched, newest first (the screen filters by channel). */
  readonly items: readonly PoolNotification[];
  readonly deliveries: Readonly<Record<string, readonly DeliveryEntry[]>>;
};

/** A socket message that is about the pool; `null` for anything else. */
export const parseLiveNotice = (data: unknown): LiveNotice | null => {
  const parsed = LiveNoticeSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

/** An answer to a notification from this client, or putting it away. */
export type FeedAnswer = "read" | Answer;

export type NotificationFeed = {
  readonly store: StoreApi<FeedState>;
  /** Fetches the newest page again (on open, on a live notice, on reconnect). */
  readonly refresh: () => Promise<void>;
  readonly markRead: (ids: readonly string[]) => Promise<void>;
  /** Answers a notification; `false` when the server could not be reached or refused. */
  readonly resolve: (id: string, answer: FeedAnswer) => Promise<boolean>;
  /** Skips one calendar occurrence everywhere (`calendarEventKey`). */
  readonly skipEvent: (eventKey: string) => Promise<boolean>;
  /** Applies what the live socket said. */
  readonly receive: (notice: LiveNotice) => void;
};

const PAGE = 50;

const replaced = (
  items: readonly PoolNotification[],
  next: PoolNotification,
): readonly PoolNotification[] =>
  items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items];

type FeedDeps = {
  readonly api: ApiClient;
  readonly source: "app" | "web";
  readonly store: StoreApi<FeedState>;
};

const refreshOf =
  ({ api, store }: FeedDeps) =>
  async (): Promise<void> => {
    if (store.getState().status === "idle") {
      store.setState({ status: "loading" });
    }
    try {
      const page = await api.call(endpoints.notifications.list, { query: { limit: PAGE } });
      store.setState({ deliveries: page.deliveries, items: page.items, status: "ready" });
    } catch {
      // Offline: what was shown stays; a first load says it failed.
      if (store.getState().status !== "ready") {
        store.setState({ status: "failed" });
      }
    }
  };

const markReadOf =
  ({ api, store }: FeedDeps) =>
  async (ids: readonly string[]): Promise<void> => {
    if (ids.length === 0) {
      return;
    }
    const at = new Date().toISOString();
    store.setState(({ items }) => ({
      items: items.map((item) =>
        ids.includes(item.id) && item.readAt === null ? { ...item, readAt: at } : item,
      ),
    }));
    try {
      await api.call(endpoints.notifications.read, { body: { ids: [...ids] } });
    } catch {
      // Read here already; the server learns on the next open.
    }
  };

/** A new one goes on top at once; a resolved one shows its answer at once; then the page again. */
const receiveOf =
  ({ store }: FeedDeps, refresh: () => Promise<void>) =>
  (notice: LiveNotice): void => {
    if (notice.type === "notification") {
      store.setState(({ items }) => ({ items: replaced(items, notice.notification) }));
      return;
    }
    if (notice.type === "dismiss") {
      const at = new Date().toISOString();
      store.setState(({ items }) => ({
        items: items.map((item) =>
          item.id === notice.id && item.resolvedAt === null
            ? { ...item, readAt: item.readAt ?? at, resolution: notice.resolution, resolvedAt: at }
            : item,
        ),
      }));
    }
    void refresh();
  };

const resolveOf =
  ({ api, source, store }: FeedDeps) =>
  async (id: string, answer: FeedAnswer): Promise<boolean> => {
    try {
      const { notification } = await api.call(endpoints.notifications.resolve, {
        body: { from: source, resolution: answer },
        params: { id },
      });
      store.setState(({ items }) => ({ items: replaced(items, notification) }));
      return true;
    } catch {
      return false;
    }
  };

const skipEventOf =
  ({ api }: FeedDeps, refresh: () => Promise<void>) =>
  async (eventKey: string): Promise<boolean> => {
    try {
      await api.call(endpoints.calendar.skip, { body: { eventKey } });
      void refresh();
      return true;
    } catch {
      return false;
    }
  };

/**
The notification pool as this client knows it: fetched from the server, kept up to date by the
live socket, answered through the same endpoint every channel uses.
*/
export const createNotificationFeed = ({
  api,
  source,
}: {
  readonly api: ApiClient;
  readonly source: "app" | "web";
}): NotificationFeed => {
  const store = createStore<FeedState>(() => ({ deliveries: {}, items: [], status: "idle" }));
  const deps: FeedDeps = { api, source, store };
  const refresh = refreshOf(deps);
  return {
    markRead: markReadOf(deps),
    receive: receiveOf(deps, refresh),
    refresh,
    resolve: resolveOf(deps),
    skipEvent: skipEventOf(deps, refresh),
    store,
  };
};
