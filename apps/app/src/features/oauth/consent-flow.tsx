import { Text, View } from "react-native";

import type { TelegramLogin } from "@pace/core";

import { useAuth, usePace, useT } from "#app/app-state.tsx";
import { IS_DEV_LOGIN_ENABLED } from "#app/platform/api-base.ts";
import { Button } from "#app/ui/button.tsx";
import { PaceMark } from "#app/ui/logo.tsx";
import { type Consent, type ConsentSession, type Identity, useConsent } from "@pace/client/react";

import { ClientCard } from "./client-card.tsx";
import { DevIdentity } from "./dev-identity.tsx";
import { ScopeList } from "./scope-list.tsx";

/** The Telegram button, given by the page (the widget exists on the web only). */
export type RenderWidget = (onAuth: (payload: TelegramLogin) => void) => React.ReactNode;

type Translate = ReturnType<typeof useT>;

/** "Signed in as …": the session's or the proved name; a session whose name is not known yet. */
const identityLine = (t: Translate, identity: Identity): string => {
  switch (identity.kind) {
    case "dev": {
      return t("oauth.signedInAs", { name: `dev ${identity.telegramId}` });
    }
    case "session": {
      return identity.name === null
        ? t("oauth.signedIn")
        : t("oauth.signedInAs", { name: identity.name });
    }
    case "telegram": {
      return t("oauth.signedInAs", { name: identity.name });
    }
  }
};

/** The browser's Pace session, as the consent page reads it from the app's auth. */
const useConsentSession = (): ConsentSession => {
  const { status, user } = useAuth();
  switch (status) {
    case "loading": {
      return { kind: "loading" };
    }
    case "signed-in": {
      return { kind: "signed-in", name: user?.name ?? null };
    }
    case "signed-out": {
      return { kind: "signed-out" };
    }
  }
};

/**
Step 1 of consent: who is allowing. Signed in, the browser's Pace session; signed out, the
Telegram widget (or a dev id locally), and the app's own sign-in for a browser where the widget
does not show (a network that blocks Telegram's frame: owner bug 2026-11-03).
*/
const IdentityStep = ({
  consent,
  onSignIn,
  renderWidget,
}: {
  readonly consent: Consent;
  readonly onSignIn: () => void;
  readonly renderWidget: RenderWidget;
}) => {
  const t = useT();
  if (consent.identity !== null) {
    return (
      <Text className="font-sans text-subhead font-normal text-label-secondary">
        {identityLine(t, consent.identity)}
      </Text>
    );
  }
  if (!consent.needsSignIn) {
    return null;
  }
  return (
    <View className="gap-3">
      <Text className="font-sans text-subhead font-normal text-label-secondary">
        {t("oauth.identify")}
      </Text>
      {renderWidget((payload) => {
        const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ");
        consent.identify({ kind: "telegram", name, payload });
      })}
      <View className="items-center">
        <Text className="text-center font-sans text-footnote text-label-secondary">
          {t("oauth.widgetMissing")}
        </Text>
        <Button onPress={onSignIn} variant="ghost" width="fill">
          {t("oauth.signInFirst")}
        </Button>
      </View>
      {IS_DEV_LOGIN_ENABLED ? (
        <DevIdentity
          onIdentify={(telegramId) => {
            consent.identify({ kind: "dev", telegramId });
          }}
        />
      ) : null}
    </View>
  );
};

/** The client, the scopes it asked for, who is allowing, then Deny / Allow. */
const ReadyStep = ({
  consent,
  onSignIn,
  renderWidget,
}: {
  readonly consent: Consent;
  readonly onSignIn: () => void;
  readonly renderWidget: RenderWidget;
}) => {
  const t = useT();
  const { phase } = consent;
  if (phase.kind !== "ready") {
    return null;
  }
  return (
    <>
      <ClientCard info={phase.info} />
      <ScopeList
        chosen={consent.scopes}
        offered={phase.info.scopes}
        onToggle={consent.toggleScope}
      />
      <IdentityStep consent={consent} onSignIn={onSignIn} renderWidget={renderWidget} />
      {consent.error === null ? null : (
        <Text accessibilityRole="alert" className="font-sans text-subhead font-normal text-danger">
          {t(consent.error)}
        </Text>
      )}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            disabled={consent.isBusy}
            onPress={() => void consent.deny()}
            variant="secondary"
            width="fill"
          >
            {t("oauth.deny")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            disabled={consent.isBusy || consent.identity === null}
            onPress={() => void consent.allow()}
            width="fill"
          >
            {t("oauth.allow")}
          </Button>
        </View>
      </View>
    </>
  );
};

/**
The branded consent page an MCP client lands on: the client, the scopes it asked for, the
person's identity, then Allow or Deny. Both answers send the browser back to the client.
*/
export const ConsentFlow = ({
  authQuery,
  onSignIn,
  redirect,
  renderWidget,
}: {
  /** The query string of the client's authorization request, exactly as the API redirected it. */
  readonly authQuery: string;
  /** Opens the app's own sign-in, which comes back to this page with the request intact. */
  readonly onSignIn: () => void;
  readonly redirect: (url: string) => void;
  readonly renderWidget: RenderWidget;
}) => {
  const t = useT();
  const { api } = usePace();
  const consent = useConsent(api, { authQuery, redirect, session: useConsentSession() });
  const { phase } = consent;
  return (
    <View className="gap-5 rounded-xl border border-separator bg-cell px-6 py-8">
      <View className="flex-row items-center gap-3">
        <PaceMark size={40} />
        <Text className="font-sans text-title1 text-label-primary">{t("app.name")}</Text>
      </View>
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans text-title1 text-label-primary">
          {t("oauth.title")}
        </Text>
        <Text className="font-sans text-subhead font-normal text-label-secondary">
          {t("oauth.body")}
        </Text>
      </View>
      {phase.kind === "invalid" ? (
        <Text accessibilityRole="alert" className="font-sans text-subhead font-normal text-danger">
          {t(phase.key)}
        </Text>
      ) : null}
      {phase.kind === "redirecting" ? (
        <Text
          accessibilityLiveRegion="polite"
          className="font-sans text-subhead font-normal text-label-secondary"
        >
          {t("oauth.redirecting", { name: phase.name })}
        </Text>
      ) : null}
      <ReadyStep consent={consent} onSignIn={onSignIn} renderWidget={renderWidget} />
    </View>
  );
};
