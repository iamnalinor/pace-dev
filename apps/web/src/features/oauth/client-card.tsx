import type { OAuthClientInfo } from "@pace/core";

import { useT } from "#web/i18n.tsx";

/**
Who is asking and where the access goes. Every string here came from the client (its
registration or metadata document); React renders them as text, never as markup.
*/
export const ClientCard = ({ info }: { readonly info: OAuthClientInfo }) => {
  const t = useT();
  return (
    <div className="grid gap-3 rounded-lg border border-line bg-raised p-4">
      <div className="flex items-center gap-3">
        {info.logoUri !== null && (
          <img
            alt={info.clientName}
            className="size-10 shrink-0 rounded-md bg-bg object-contain"
            referrerPolicy="no-referrer"
            src={info.logoUri}
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-[-0.01em]">{info.clientName}</p>
          <p className="text-xs text-muted">
            {info.clientDomain === null
              ? t("oauth.unverified")
              : t("oauth.publishedBy", { domain: info.clientDomain })}
          </p>
        </div>
      </div>
      <p className="text-sm text-fg2">{t("oauth.redirectTo", { host: info.redirectHost })}</p>
      {info.redirectIsLoopback && <p className="text-sm text-warn">{t("oauth.loopbackWarning")}</p>}
    </div>
  );
};
