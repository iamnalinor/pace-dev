import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { IS_DEV_LOGIN_ENABLED } from "#web/platform/api-base.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { Card } from "#web/shared/ui/card.tsx";
import { PaceMark } from "#web/shared/ui/pace-mark.tsx";
import { TelegramWidget } from "#web/shared/ui/telegram-widget.tsx";

import { ClientCard } from "./client-card.tsx";
import { DevIdentity } from "./dev-identity.tsx";
import { ScopeList } from "./scope-list.tsx";
import { type Consent, type Identity, useConsent } from "./use-consent.ts";

type Props = {
  /** The query string of the client's authorization request, exactly as the API redirected it. */
  readonly authQuery: string;
  /** Where the browser goes when consent ends; tests observe it instead of navigating. */
  readonly redirect?: (url: string) => void;
};

const navigateTo = (url: string): void => {
  globalThis.location.assign(url);
};

const identityLabel = (identity: Identity): string =>
  identity.kind === "dev" ? `dev ${identity.telegramId}` : identity.name;

/** Step 1 of consent: prove who is allowing, with the Telegram widget (or a dev id locally). */
const IdentityStep = ({ consent }: { readonly consent: Consent }) => {
  const t = useT();
  const { botUsername } = useServices();
  if (consent.identity !== null) {
    return (
      <p className="text-sm text-fg2">
        {t("oauth.signedInAs", { name: identityLabel(consent.identity) })}
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">{t("oauth.identify")}</p>
      <TelegramWidget
        botUsername={botUsername}
        label={t("login.telegram")}
        onAuth={(payload) => {
          const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ");
          consent.identify({ kind: "telegram", name, payload });
        }}
        texts={{
          failed: t("login.widgetFailed"),
          loading: t("login.widgetLoading"),
          slow: t("login.widgetSlow"),
        }}
      />
      {IS_DEV_LOGIN_ENABLED && (
        <DevIdentity
          onIdentify={(telegramId) => {
            consent.identify({ kind: "dev", telegramId });
          }}
        />
      )}
    </div>
  );
};

/**
The branded consent page an MCP client lands on: the client, the scopes it asked for, the
person's identity, then Allow or Deny. Both answers send the browser back to the client.
*/
export const ConsentFlow = ({ authQuery, redirect = navigateTo }: Props) => {
  const t = useT();
  const consent = useConsent(authQuery, redirect);
  const { phase } = consent;
  return (
    <Card className="grid gap-5 px-6 py-8">
      <div className="flex items-center gap-3">
        <PaceMark className="size-10" />
        <span className="text-2xl font-semibold tracking-[-0.04em]">{t("app.name")}</span>
      </div>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("oauth.title")}</h1>
        <p className="text-sm text-muted">{t("oauth.body")}</p>
      </div>
      {phase.kind === "invalid" && (
        <p className="text-sm text-warn" role="alert">
          {t(phase.key)}
        </p>
      )}
      {phase.kind === "redirecting" && (
        <p aria-live="polite" className="text-sm text-fg2">
          {t("oauth.redirecting", { name: phase.name })}
        </p>
      )}
      {phase.kind === "ready" && (
        <>
          <ClientCard info={phase.info} />
          <ScopeList
            chosen={consent.scopes}
            offered={phase.info.scopes}
            onToggle={consent.toggleScope}
          />
          <IdentityStep consent={consent} />
          {consent.error !== null && (
            <p className="text-sm text-warn" role="alert">
              {t(consent.error)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button disabled={consent.isBusy} onClick={consent.deny} variant="outline">
              {t("oauth.deny")}
            </Button>
            <Button
              disabled={consent.isBusy || consent.identity === null}
              onClick={consent.allow}
              variant="accent"
            >
              {t("oauth.allow")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};
