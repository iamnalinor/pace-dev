/** Settings → Devices and sessions: every way into the account, revoking one, connecting a computer. */
import { useCallback, useEffect, useState } from "react";

import { endpoints, type Session } from "@pace/core";

import { type ApiClient, ApiError } from "../api-client.ts";

/** A computer just connected: its agent token is shown this once. */
export type NewAgent = { readonly id: string; readonly name: string; readonly token: string };

export type Sessions = {
  readonly status: "error" | "loading" | "ready";
  readonly sessions: readonly Session[];
  /** When the shown list was asked for (this device's clock); null until one arrived. */
  readonly loadedAt: null | string;
  readonly reload: () => void;
  /**
  Ends a session or revokes an MCP app's grant; the row goes once the server agrees, or says it
  is gone already (ended elsewhere: the list reloads). Rejects when it did not go through. Ending
  the current session is logging out: the caller signs out.
  */
  readonly revoke: (id: string) => Promise<void>;
  /** Connects a computer; rejects when the server could not be reached. */
  readonly createAgent: (name: string) => Promise<NewAgent>;
};

type Loaded = Pick<Sessions, "loadedAt" | "sessions" | "status">;

/** The server has no such session (any more): a revoke of it has nothing left to do. */
const isAlreadyEnded = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "session/not-found";

export const useSessions = (api: ApiClient): Sessions => {
  const [loaded, setLoaded] = useState<Loaded>({
    loadedAt: null,
    sessions: [],
    status: "loading",
  });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    // Dropped on unmount, so a late answer never updates a screen that is gone.
    const lifetime = { isCurrent: true };
    void (async () => {
      const askedAt = new Date().toISOString();
      try {
        const { sessions } = await api.call(endpoints.sessions.list, {});
        if (lifetime.isCurrent) {
          setLoaded({ loadedAt: askedAt, sessions, status: "ready" });
        }
      } catch {
        if (lifetime.isCurrent) {
          setLoaded((current) => ({ ...current, status: "error" }));
        }
      }
    })();
    return () => {
      lifetime.isCurrent = false;
    };
  }, [api, generation]);
  const reload = useCallback(() => {
    // A retry after a failure shows the loading state again; a refresh of a shown list does not.
    setLoaded((current) =>
      current.status === "error" ? { ...current, status: "loading" } : current,
    );
    setGeneration((current) => current + 1);
  }, []);
  return {
    createAgent: async (name) => {
      const created = await api.call(endpoints.sessions.createAgent, { body: { name } });
      reload();
      return created;
    },
    reload,
    revoke: async (id) => {
      try {
        await api.call(endpoints.sessions.revoke, { params: { id } });
      } catch (error) {
        // Ended elsewhere meanwhile: what the person asked for is done, and the list is stale.
        if (!isAlreadyEnded(error)) {
          throw error;
        }
        reload();
      }
      setLoaded((current) => ({
        ...current,
        sessions: current.sessions.filter((session) => session.id !== id),
      }));
    },
    loadedAt: loaded.loadedAt,
    sessions: loaded.sessions,
    status: loaded.status,
  };
};
