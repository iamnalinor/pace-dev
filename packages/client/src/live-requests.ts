import { LIVE_MAX_IN_FLIGHT, LIVE_REQUEST_TIMEOUT_MS, type LiveServerMessage } from "@pace/core";

/**
A socket request that cannot be made or answered: the socket is closed or speaks only v1
(`closed`), it already has `LIVE_MAX_IN_FLIGHT` requests open (`busy`), no answer came within
`LIVE_REQUEST_TIMEOUT_MS` (`timeout`), or the answer was not one the request expects
(`refused`). The caller goes over HTTP instead.
*/
export class LiveUnavailable extends Error {
  readonly reason: "busy" | "closed" | "refused" | "timeout";

  constructor(reason: "busy" | "closed" | "refused" | "timeout") {
    super(`live socket unavailable: ${reason}`);
    this.name = "LiveUnavailable";
    this.reason = reason;
  }
}

/**
The open requests of one channel, by id: at most `LIVE_MAX_IN_FLIGHT`, each failed after
`LIVE_REQUEST_TIMEOUT_MS` (then `onTimeout` drops the socket that went quiet) or when the socket
goes, and settled by the server's message of the same id.
*/
export type Requests = {
  /** Fails every open request (the socket is gone). */
  readonly failAll: () => void;
  /** Opens a request (refused when the window is full) and sends it with `send`. */
  readonly open: (id: string, send: () => void) => Promise<LiveServerMessage>;
  /** Settles the request a message answers; false when it answers none open. */
  readonly settle: (message: LiveServerMessage) => boolean;
  readonly invalid: (id: string) => void;
};

export const createRequests = (onTimeout: () => void): Requests => {
  type Pending = {
    readonly resolve: (message: LiveServerMessage) => void;
    readonly reject: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
  };
  const pending = new Map<string, Pending>();
  return {
    invalid: (id) => {
      const request = pending.get(id);
      if (request === undefined) {
        return;
      }
      pending.delete(id);
      clearTimeout(request.timer);
      request.reject(new Error("sync/invalid-response"));
    },
    failAll: (): void => {
      for (const [id, request] of pending) {
        pending.delete(id);
        clearTimeout(request.timer);
        request.reject(new LiveUnavailable("closed"));
      }
    },
    open: async (id: string, send: () => void): Promise<LiveServerMessage> => {
      if (pending.size >= LIVE_MAX_IN_FLIGHT || pending.has(id)) {
        throw new LiveUnavailable("busy");
      }
      // `new Promise`, not `Promise.withResolvers`: Hermes (Android) may lack the ES2024 call.
      return await new Promise<LiveServerMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new LiveUnavailable("timeout"));
          onTimeout();
        }, LIVE_REQUEST_TIMEOUT_MS);
        // Registered before it is sent: an answer may come back at once.
        pending.set(id, { reject, resolve, timer });
        try {
          send();
        } catch {
          // A socket closing meanwhile: its close fails the rest.
          pending.delete(id);
          clearTimeout(timer);
          reject(new LiveUnavailable("closed"));
        }
      });
    },
    settle: (message: LiveServerMessage): boolean => {
      const id = "id" in message ? message.id : undefined;
      const request = id === undefined ? undefined : pending.get(id);
      if (id === undefined || request === undefined) {
        return false;
      }
      pending.delete(id);
      clearTimeout(request.timer);
      request.resolve(message);
      return true;
    },
  };
};
