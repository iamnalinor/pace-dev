import { useEffect, useState } from "react";

import { useServices } from "#web/app-state.tsx";
import { ApiError } from "@pace/client";
import {
  endpoints,
  type MessageKey,
  type OAuthClientInfo,
  type OAuthScope,
  type TelegramLogin,
} from "@pace/core";

/** Who is allowing: a signed widget payload, or a dev id (local and e2e builds only). */
export type Identity =
  | { readonly kind: "dev"; readonly telegramId: string }
  | { readonly kind: "telegram"; readonly name: string; readonly payload: TelegramLogin };

export type Phase =
  | { readonly kind: "invalid"; readonly key: MessageKey }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly info: OAuthClientInfo }
  | { readonly kind: "redirecting"; readonly name: string };

export type Consent = {
  readonly phase: Phase;
  readonly scopes: readonly OAuthScope[];
  readonly identity: Identity | null;
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

const identityBody = (identity: Identity) =>
  identity.kind === "dev" ? { devTelegramId: identity.telegramId } : { telegram: identity.payload };

/**
 * The consent page's state machine: load what to show for the request, let the person tick
 * scopes and prove who they are, then Allow or Deny — both end in a redirect to the client.
 */
export const useConsent = (authQuery: string, redirect: (url: string) => void): Consent => {
  const { api } = useServices();
  const [phase, setPhase] = useState<Phase>(() =>
    authQuery === "" ? { key: "oauth.invalidRequest", kind: "invalid" } : { kind: "loading" },
  );
  const [scopes, setScopes] = useState<readonly OAuthScope[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (authQuery === "") {
      return;
    }
    // Aborted on unmount, so a late answer never updates a page that is gone.
    const lifetime = new AbortController();
    void (async () => {
      try {
        const info = await api.call(endpoints.oauth.clientInfo, { query: { authQuery } });
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
    identify: setIdentity,
    identity,
    isBusy,
    phase,
    scopes,
    toggleScope: (scope) => {
      setScopes((current) =>
        current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
      );
    },
  };
};
