import { type KnownLiveServerMessage, LiveServerMessageSchema } from "@pace/core";

import type { SocketLike } from "./live.ts";

type Listener = (event: { readonly code?: unknown; readonly data?: unknown }) => void;

/** A socket the client opened, with the server's side played by the test. */
export type FakeSocket = SocketLike & {
  readonly url: string;
  readonly protocols: readonly string[];
  readonly sent: string[];
  closed: boolean;
  /** What the server would do. */
  open: () => void;
  receive: (data: string) => void;
  /** The connection goes, with the close code the server gave (none for a dropped network). */
  drop: (code?: number) => void;
  /** Called with every message the client sends, after it is recorded in `sent`. */
  onSend?: (data: string) => void;
};

/** Every socket a client opens through `create`, in order. */
export const fakeSockets = (): {
  readonly made: FakeSocket[];
  readonly create: (url: string, protocols: readonly string[]) => SocketLike;
} => {
  const made: FakeSocket[] = [];
  return {
    create: (url, protocols) => {
      const listeners = new Map<string, Listener[]>();
      const emit = (type: string, event: { readonly code?: number; readonly data?: string }) => {
        const heard = listeners.get(type) ?? [];
        for (const listener of heard) {
          listener(event);
        }
      };
      const socket: FakeSocket = {
        addEventListener: (type, listener) => {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        close: () => {
          socket.closed = true;
          emit("close", {});
        },
        closed: false,
        drop: (code) => {
          emit("close", code === undefined ? {} : { code });
        },
        open: () => {
          emit("open", {});
        },
        protocols,
        receive: (data) => {
          emit("message", { data });
        },
        send: (data) => {
          socket.sent.push(data);
          socket.onSend?.(data);
        },
        sent: [],
        url,
      };
      made.push(socket);
      return socket;
    },
    made,
  };
};

/** The server sends one message, checked against its own schema first (class 12). */
export const say = (socket: FakeSocket, message: KnownLiveServerMessage): void => {
  LiveServerMessageSchema.parse(message);
  socket.receive(JSON.stringify(message));
};
