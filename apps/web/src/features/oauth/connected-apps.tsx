import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { endpoints, type OAuthGrant } from "@pace/core";

import { GrantRow } from "./grant-row.tsx";

type Phase =
  | { readonly kind: "failed" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly grants: readonly OAuthGrant[] };

/** The MCP clients holding a grant on this account, each with a confirmed revoke. */
export const ConnectedApps = () => {
  const t = useT();
  const language = useLanguage();
  const { api } = useServices();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState<null | string>(null);

  useEffect(() => {
    // Aborted on unmount, so a late answer never updates a section that is gone.
    const lifetime = new AbortController();
    void (async () => {
      try {
        const { grants } = await api.call(endpoints.oauth.grants.list, {});
        if (!lifetime.signal.aborted) {
          setPhase({ grants, kind: "ready" });
        }
      } catch {
        if (!lifetime.signal.aborted) {
          setPhase({ kind: "failed" });
        }
      }
    })();
    return () => {
      lifetime.abort();
    };
  }, [api]);

  const revoke = async (grant: OAuthGrant): Promise<void> => {
    setError(null);
    try {
      await api.call(endpoints.oauth.grants.revoke, { params: { id: grant.id } });
      setPhase((current) =>
        current.kind === "ready"
          ? { ...current, grants: current.grants.filter((item) => item.id !== grant.id) }
          : current,
      );
      toast(t("connectedApps.revoked"));
    } catch {
      setError(t("connectedApps.revokeFailed"));
    }
  };

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">{t("connectedApps.hint")}</p>
      {phase.kind === "loading" && (
        <p className="text-sm text-muted">{t("connectedApps.loading")}</p>
      )}
      {phase.kind === "failed" && <p className="text-sm text-warn">{t("connectedApps.failed")}</p>}
      {phase.kind === "ready" &&
        (phase.grants.length === 0 ? (
          <p className="text-sm text-muted">{t("connectedApps.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {phase.grants.map((grant) => (
              <GrantRow
                grant={grant}
                key={grant.id}
                language={language}
                onRevoke={() => {
                  void revoke(grant);
                }}
              />
            ))}
          </ul>
        ))}
      {error !== null && (
        <p className="text-sm text-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
