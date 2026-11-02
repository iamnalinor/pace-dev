import type { Page } from "@playwright/test";

/** A push or a pull, whichever channel carried it (the socket when it is up, else HTTP). */
export type SyncStep = "pull" | "push";

/** What the page sent to sync: HTTP calls to the sync routes and frames on the live socket. */
export type SyncTraffic = {
  /** `METHOD path?query` of every HTTP sync call since the last `reset`. */
  readonly calls: readonly string[];
  /** Every socket frame the page sent since the last `reset`, the keep-alive's pings left out. */
  readonly frames: readonly string[];
  /** The sync steps in the order they went out, over either channel, since the last `reset`. */
  readonly steps: readonly SyncStep[];
  readonly reset: () => void;
  /**
  Waits `ms` and answers what went out meanwhile: the steady state a test pins after a status
  settles (the network goes quiet, CLAUDE.md "trace the client side").
  */
  readonly over: (ms: number) => Promise<{ readonly calls: string[]; readonly frames: string[] }>;
};

/** Records the page's sync traffic from now on (call before `goto`). */
export const recordSyncTraffic = (page: Page): SyncTraffic => {
  const calls: string[] = [];
  const frames: string[] = [];
  const steps: SyncStep[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/sync/") && url.pathname !== "/api/sync/live") {
      calls.push(`${request.method()} ${url.pathname}${url.search}`);
    }
    if (url.pathname === "/api/sync/push" || url.pathname === "/api/sync/pull") {
      steps.push(url.pathname === "/api/sync/push" ? "push" : "pull");
    }
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const frame = String(payload);
      if (frame !== "ping") {
        frames.push(frame);
      }
      if (frame.includes('"type":"push"') || frame.includes('"type":"pull"')) {
        steps.push(frame.includes('"type":"push"') ? "push" : "pull");
      }
    });
  });
  const reset = (): void => {
    calls.length = 0;
    frames.length = 0;
    steps.length = 0;
  };
  return {
    calls,
    frames,
    steps,
    over: async (ms) => {
      reset();
      // A window of time is what is measured here, not a condition to wait for.
      await new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
      return { calls: [...calls], frames: [...frames] };
    },
    reset,
  };
};

/** The items that occur more than once (a request sent again for the same thing). */
export const repeated = (items: readonly string[]): readonly string[] =>
  items.filter((item, index) => items.indexOf(item) !== index);

/** A push went out and a pull after it: the run that sent a write has caught up after it. */
export const hasPulledAfterPush = (steps: readonly SyncStep[]): boolean => {
  const pushedAt = steps.lastIndexOf("push");
  return pushedAt !== -1 && steps.includes("pull", pushedAt);
};
