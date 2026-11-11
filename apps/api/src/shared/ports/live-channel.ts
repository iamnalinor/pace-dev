import type { ActorStorage } from "./actor-storage.ts";

export type LiveSocket = {
  readonly send: (message: string) => void;
  readonly close: (code: number, reason: string) => void;
};

/** Tags and sessions survive actor hibernation. Socket upgrade details belong to the host. */
export type LiveChannel = {
  readonly getWebSockets: (tag?: string) => LiveSocket[];
  readonly getTags: (socket: LiveSocket) => string[];
  readonly upgrade: (protocol: string, tags: readonly string[], hello?: string) => Response;
  readonly keepAlive: (request: string, response: string) => void;
};

export type ActorContext = LiveChannel & {
  readonly storage: ActorStorage;
  readonly id: { readonly name?: string };
  readonly blockConcurrencyWhile: <T>(body: () => Promise<T>) => Promise<T>;
  readonly waitUntil: (work: Promise<unknown>) => void;
};
