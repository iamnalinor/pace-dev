/** Settings → Devices and sessions: every way into the account, revoking one, connecting a computer. */
import { useCallback, useEffect, useState } from "react";

import { endpoints, type Session } from "@pace/core";

import type { ApiClient } from "../api-client.ts";

/** A computer just connected: its agent token is shown this once. */
export type NewAgent = { readonly id: string; readonly name: string; readonly token: string };

export type Sessions = {
  readonly status: "error" | "loading" | "ready";
  readonly sessions: readonly Session[];
  readonly reload: () => void;
  /**
  Ends a session or revokes an MCP app's grant; the row goes once the server agrees. Rejects when
  it did not go through. Ending the current session is logging out: the caller signs out.
  */
  readonly revoke: (id: string) => Promise<void>;
  /** Connects a computer; rejects when the server could not be reached. */
  readonly createAgent: (name: string) => Promise<NewAgent>;
};

type Loaded = Pick<Sessions, "sessions" | "status">;

export const useSessions = (api: ApiClient): Sessions => {
  const [loaded, setLoaded] = useState<Loaded>({ sessions: [], status: "loading" });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    // Dropped on unmount, so a late answer never updates a screen that is gone.
    const lifetime = { isCurrent: true };
    void (async () => {
      try {
        const { sessions } = await api.call(endpoints.sessions.list, {});
        if (lifetime.isCurrent) {
          setLoaded({ sessions, status: "ready" });
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
      await api.call(endpoints.sessions.revoke, { params: { id } });
      setLoaded((current) => ({
        ...current,
        sessions: current.sessions.filter((session) => session.id !== id),
      }));
    },
    sessions: loaded.sessions,
    status: loaded.status,
  };
};
