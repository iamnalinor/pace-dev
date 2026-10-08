import { Text, View } from "react-native";

import type { TelegramLogin } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { IS_DEV_LOGIN_ENABLED } from "#app/platform/api-base.ts";
import { Button } from "#app/ui/button.tsx";
import { PaceMark } from "#app/ui/logo.tsx";
import { type Consent, type Identity, useConsent } from "@pace/client/react";

import { ClientCard } from "./client-card.tsx";
import { DevIdentity } from "./dev-identity.tsx";
import { ScopeList } from "./scope-list.tsx";

/** The Telegram button, given by the page (the widget exists on the web only). */
export type RenderWidget = (onAuth: (payload: TelegramLogin) => void) => React.ReactNode;

const identityLabel = (identity: Identity): string =>
  identity.kind === "dev" ? `dev ${identity.telegramId}` : identity.name;

/** Step 1 of consent: prove who is allowing, with the Telegram widget (or a dev id locally). */
const IdentityStep = ({
  consent,
  renderWidget,
}: {
  readonly consent: Consent;
  readonly renderWidget: RenderWidget;
}) => {
  const t = useT();
  if (consent.identity !== null) {
    return (
      <Text className="font-sans text-[14px] text-fg2">
        {t("oauth.signedInAs", { name: identityLabel(consent.identity) })}
      </Text>
    );
  }
  return (
    <View className="gap-3">
      <Text className="font-sans text-[14px] text-muted">{t("oauth.identify")}</Text>
      {renderWidget((payload) => {
        const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ");
        consent.identify({ kind: "telegram", name, payload });
      })}
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
  renderWidget,
}: {
  readonly consent: Consent;
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
      <IdentityStep consent={consent} renderWidget={renderWidget} />
      {consent.error === null ? null : (
        <Text accessibilityRole="alert" className="font-sans text-[14px] text-warn">
          {t(consent.error)}
        </Text>
      )}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button disabled={consent.isBusy} onPress={() => void consent.deny()} variant="secondary">
            {t("oauth.deny")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            disabled={consent.isBusy || consent.identity === null}
            onPress={() => void consent.allow()}
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
  redirect,
  renderWidget,
}: {
  /** The query string of the client's authorization request, exactly as the API redirected it. */
  readonly authQuery: string;
  readonly redirect: (url: string) => void;
  readonly renderWidget: RenderWidget;
}) => {
  const t = useT();
  const { api } = usePace();
  const consent = useConsent(api, authQuery, redirect);
  const { phase } = consent;
  return (
    <View className="gap-5 rounded-xl border border-line bg-surface px-6 py-8">
      <View className="flex-row items-center gap-3">
        <PaceMark size={40} />
        <Text className="font-sans text-[24px] font-semibold tracking-[-0.04em] text-fg">
          {t("app.name")}
        </Text>
      </View>
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans text-[24px] font-semibold text-fg">
          {t("oauth.title")}
        </Text>
        <Text className="font-sans text-[14px] text-muted">{t("oauth.body")}</Text>
      </View>
      {phase.kind === "invalid" ? (
        <Text accessibilityRole="alert" className="font-sans text-[14px] text-warn">
          {t(phase.key)}
        </Text>
      ) : null}
      {phase.kind === "redirecting" ? (
        <Text accessibilityLiveRegion="polite" className="font-sans text-[14px] text-fg2">
          {t("oauth.redirecting", { name: phase.name })}
        </Text>
      ) : null}
      <ReadyStep consent={consent} renderWidget={renderWidget} />
    </View>
  );
};
