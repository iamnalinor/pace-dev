import * as SecureStore from "expo-secure-store";

import type { PaceClientOptions, SessionStore } from "@pace/client";

import { API_BASE_URL } from "./api-base.ts";

const SESSION_KEY = "pace.session";
const ENDED_KEY = "pace.ended-sessions";

type StoredSession = { readonly origin: string; readonly token: string };

/**
What is stored, with the server it belongs to. A bare token was written before a server could be
chosen, when every token was the build's own server's.
*/
const parseStored = (raw: string): StoredSession => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "origin" in parsed &&
      "token" in parsed &&
      typeof parsed.origin === "string" &&
      typeof parsed.token === "string"
    ) {
      return { origin: parsed.origin, token: parsed.token };
    }
  } catch {
    // Not JSON: a bare token from before.
  }
  return { origin: API_BASE_URL, token: raw };
};

/**
The bearer token in the Android Keystore-backed secure store (localStorage on the web), kept with
the origin of the server that issued it: a store for another server reads it as signed out, so a
token is never sent to a server it does not belong to.
*/
export const createSecureSessionStore = (origin: string): SessionStore => ({
  clear: async () => {
    await clearStoredSession();
  },
  get: async () => {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (raw === null) {
      return null;
    }
    const stored = parseStored(raw);
    return stored.origin === origin ? stored.token : null;
  },
  set: async (token) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ origin, token }));
  },
});

/** Forgets the stored token whichever server it was for (a server switch). */
export const clearStoredSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SESSION_KEY);
};

type EndedSessionStore = NonNullable<PaceClientOptions["endedSessions"]>;
type EndedByServer = Readonly<Record<string, readonly string[]>>;

const readEnded = async (): Promise<EndedByServer> => {
  const raw = await SecureStore.getItemAsync(ENDED_KEY);
  if (raw === null) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([origin, tokens]): [string, readonly string[]] => [
        origin,
        Array.isArray(tokens)
          ? tokens.filter((token): token is string => typeof token === "string")
          : [],
      ]),
    );
  } catch {
    return {};
  }
};

/**
The sessions signed out of here that a server has not ended yet (a Log out with no network,
QA round 22 R22-02), in the same secure store, each kept with the server it belongs to: a token is
only ever sent to its own server, and only to end itself.
*/
export const createSecureEndedSessionStore = (origin: string): EndedSessionStore => {
  const write = async (change: (tokens: readonly string[]) => readonly string[]): Promise<void> => {
    const all = await readEnded();
    const next = change(all[origin] ?? []);
    const { [origin]: _mine, ...others } = all;
    const kept = next.length === 0 ? others : { ...others, [origin]: next };
    await (Object.keys(kept).length === 0
      ? SecureStore.deleteItemAsync(ENDED_KEY)
      : SecureStore.setItemAsync(ENDED_KEY, JSON.stringify(kept)));
  };
  return {
    add: async (token) => {
      await write((tokens) => (tokens.includes(token) ? tokens : [...tokens, token]));
    },
    list: async () => {
      const all = await readEnded();
      return all[origin] ?? [];
    },
    remove: async (token) => {
      await write((tokens) => tokens.filter((kept) => kept !== token));
    },
  };
};
