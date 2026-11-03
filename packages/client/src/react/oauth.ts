/** The OAuth consent page as a hook over the API client. */
import { useEffect, useState } from "react";

import {
  endpoints,
  type MessageKey,
  type OAuthClientInfo,
  type OAuthScope,
  type TelegramLogin,
} from "@pace/core";

import { type ApiClient, ApiError } from "../api-client.ts";
import { withinDeadline } from "../deadline.ts";

/**
Who is allowing: the browser's Pace session (its bearer is the proof), or, signed out, a signed
widget payload or a dev id (local and e2e builds only).
*/
export type Identity =
  | { readonly kind: "dev"; readonly telegramId: string }
  | { readonly kind: "session"; readonly name: string }
  | { readonly kind: "telegram"; readonly name: string; readonly payload: TelegramLogin };

/**
The browser's Pace session as the consent page needs it: still being read (a stored session whose
person the server has not named yet counts as that), none, or one with the person's name.
*/
export type ConsentSession =
  | { readonly kind: "loading" }
  | { readonly kind: "signed-in"; readonly name: string }
  | { readonly kind: "signed-out" };

export type ConsentPhase =
  | { readonly kind: "invalid"; readonly key: MessageKey }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly info: OAuthClientInfo }
  | { readonly kind: "redirecting"; readonly name: string };

export type Consent = {
  readonly phase: ConsentPhase;
  readonly scopes: readonly OAuthScope[];
  /** The session's identity while the browser holds one, else the one proved on the page. */
  readonly identity: Identity | null;
  /** Whether the page should offer signing in (the widget, the app's sign-in): no session. */
  readonly needsSignIn: boolean;
  readonly error: MessageKey | null;
  readonly isBusy: boolean;
  readonly identify: (identity: Identity) => void;
  readonly toggleScope: (scope: OAuthScope) => void;
  readonly allow: () => Promise<void>;
  readonly deny: () => Promise<void>;
};

/** Maps an API error code to the line shown under the card. */
const errorKey = (error: unknown): MessageKey => {
  const code = error instanceof ApiError ? error.code : "network";
  switch (code) {
    case "auth/not-allowed": {
      return "login.notAllowed";
    }
    // The session the page used is revoked or expired: the app's session check signs out and
    // the page offers signing in (owner bug 2026-11-03).
    case "auth/unauthorized": {
      return "oauth.sessionEnded";
    }
    case "oauth/client-unverified":
    case "oauth/invalid-request": {
      return "oauth.invalidRequest";
    }
    case "oauth/no-scopes":
    case "oauth/scope-not-requested": {
      return "oauth.noScopes";
    }
    default: {
      return "oauth.failed";
    }
  }
};

/** The proof the body carries: none for the session (the API client sends its bearer). */
const identityBody = (identity: Identity) => {
  switch (identity.kind) {
    case "dev": {
      return { devTelegramId: identity.telegramId };
    }
    case "session": {
      return {};
    }
    case "telegram": {
      return { telegram: identity.payload };
    }
  }
};

/**
Who is allowing: a session always wins (the API refuses a second proof next to its bearer); a
proof made on the page counts only while signed out; nothing while the session is still read.
*/
const identityOf = (session: ConsentSession, proved: Identity | null): Identity | null => {
  switch (session.kind) {
    case "loading": {
      return null;
    }
    case "signed-in": {
      return { kind: "session", name: session.name };
    }
    case "signed-out": {
      return proved;
    }
  }
};

/** What to show for the request: loaded once, with every requested scope ticked. */
const useClientInfo = (api: ApiClient, authQuery: string) => {
  const [phase, setPhase] = useState<ConsentPhase>(() =>
    authQuery === "" ? { key: "oauth.invalidRequest", kind: "invalid" } : { kind: "loading" },
  );
  const [scopes, setScopes] = useState<readonly OAuthScope[]>([]);

  useEffect(() => {
    if (authQuery === "") {
      return;
    }
    // Aborted on unmount, so a late answer never updates a page that is gone.
    const lifetime = new AbortController();
    void (async () => {
      try {
        // Details that never come end as "failed", not a page loading for good (bug class 62).
        const info = await withinDeadline(
          async (signal) =>
            await api.call(endpoints.oauth.clientInfo, { query: { authQuery } }, { signal }),
        );
        if (!lifetime.signal.aborted) {
          setScopes(info.scopes);
          setPhase({ info, kind: "ready" });
        }
      } catch (error_) {
        if (!lifetime.signal.aborted) {
          setPhase({ key: errorKey(error_), kind: "invalid" });
        }
      }
    })();
    return () => {
      lifetime.abort();
    };
  }, [api, authQuery]);
  return { phase, scopes, setPhase, setScopes };
};

/**
The consent page's state machine: load what to show for the request, let the person tick
scopes and prove who they are, then Allow or Deny — both end in a redirect to the client.
A browser that holds the person's Pace session allows with it; only a signed-out one proves
who is allowing on the page (owner bug 2026-11-03: the widget was asked for even when signed in).
*/
export const useConsent = (
  api: ApiClient,
  {
    authQuery,
    redirect,
    session,
  }: {
    /** The query string of the client's authorization request. */
    readonly authQuery: string;
    readonly redirect: (url: string) => void;
    readonly session: ConsentSession;
  },
): Consent => {
  const { phase, scopes, setPhase, setScopes } = useClientInfo(api, authQuery);
  const [proved, setProved] = useState<Identity | null>(null);
  const identity = identityOf(session, proved);
  const [error, setError] = useState<MessageKey | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const finish = async (request: () => Promise<{ readonly redirectTo: string }>): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const { redirectTo } = await request();
      setPhase({ kind: "redirecting", name: phase.kind === "ready" ? phase.info.clientName : "" });
      redirect(redirectTo);
    } catch (error_) {
      setError(errorKey(error_));
      setIsBusy(false);
    }
  };

  return {
    allow: async () => {
      if (identity === null || phase.kind !== "ready") {
        return;
      }
      // Keep the order the app asked for; the ticks only remove.
      const granted = phase.info.scopes.filter((scope) => scopes.includes(scope));
      const body = { authQuery, scopes: granted, ...identityBody(identity) };
      await finish(async () => await api.call(endpoints.oauth.complete, { body }));
    },
    deny: async () => {
      await finish(async () => await api.call(endpoints.oauth.deny, { body: { authQuery } }));
    },
    error,
    identify: setProved,
    identity,
    isBusy,
    needsSignIn: session.kind === "signed-out",
    phase,
    scopes,
    toggleScope: (scope) => {
      setScopes((current) =>
        current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
      );
    },
  };
};
