import { useState } from "react";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { type Language, type OAuthGrant, type OAuthScope, OAuthScopeSchema } from "@pace/core";

import { SCOPE_KEYS } from "./scopes.ts";

type Props = {
  readonly grant: OAuthGrant;
  readonly language: Language;
  readonly onRevoke: () => void;
};

const isKnownScope = (scope: string): scope is OAuthScope =>
  OAuthScopeSchema.safeParse(scope).success;

/** One grant: the client (its own name, rendered as text), what it may do, and a two-step revoke. */
export const GrantRow = ({ grant, language, onRevoke }: Props) => {
  const t = useT();
  const [isConfirming, setIsConfirming] = useState(false);
  const connectedOn = new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
    new Date(grant.createdAt),
  );
  return (
    <li className="grid gap-2 rounded-lg border border-line bg-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{grant.clientName}</p>
          <p className="text-xs text-muted">
            {t("connectedApps.connected", { date: connectedOn })}
          </p>
        </div>
        {!isConfirming && (
          <Button
            onClick={() => {
              setIsConfirming(true);
            }}
            size="sm"
            variant="outline"
          >
            {t("connectedApps.revoke")}
          </Button>
        )}
      </div>
      <div className="grid gap-0.5 text-xs text-fg2">
        {grant.scopes.map((scope) => (
          <span key={scope}>{isKnownScope(scope) ? t(SCOPE_KEYS[scope]) : scope}</span>
        ))}
      </div>
      {isConfirming && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1">
            {t("connectedApps.revokeConfirm", { name: grant.clientName })}
          </span>
          <Button
            onClick={() => {
              setIsConfirming(false);
            }}
            size="sm"
            variant="ghost"
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={onRevoke} size="sm">
            {t("connectedApps.revokeYes")}
          </Button>
        </div>
      )}
    </li>
  );
};
