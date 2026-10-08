import { type SyntheticEvent, useState } from "react";

import type { Decision } from "@pace/core";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatDateTime } from "#web/shared/format/time.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";
import { decisionLabelKey } from "@pace/client";
import { useDecisions } from "@pace/client/react";

/** Known kinds and outcomes are translated; anything newer shows as the server wrote it. */
const useLabel = () => {
  const t = useT();
  return (group: "kind" | "outcome", value: string): string => {
    const key = decisionLabelKey(group, value);
    return key === null ? value : t(key);
  };
};

const DecisionRow = ({ decision, tz }: { readonly decision: Decision; readonly tz: string }) => {
  const language = useLanguage();
  const label = useLabel();
  return (
    <li className="grid gap-0.5 border-t border-line py-2.5 text-sm">
      <p>
        {label("kind", decision.kind)} · <span className="font-mono text-xs">{decision.rule}</span>{" "}
        · <span className="font-medium">{label("outcome", decision.outcome)}</span>
      </p>
      <p className="text-fg2">{decision.explanation}</p>
      <p className="font-mono text-xs text-muted">{formatDateTime(decision.at, tz, language)}</p>
    </li>
  );
};

/** Every automatic decision (notifications sent or held back, assistant readings), searchable. */
export const DecisionsScreen = () => {
  const t = useT();
  const { api, hooks } = useServices();
  const { deviceTz } = hooks.useClock();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const loaded = useDecisions(api, search);
  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSearch(query);
  };
  return (
    <main className="flex flex-1 flex-col gap-4 pb-6">
      <PageHeader title={t("decisions.title")} />
      <form className="flex gap-2 px-5" onSubmit={onSubmit} role="search">
        <label className="sr-only" htmlFor="decisions-search">
          {t("decisions.search")}
        </label>
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted"
          id="decisions-search"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder={t("decisions.search")}
          type="search"
          value={query}
        />
        <Button type="submit" variant="outline">
          {t("decisions.searchButton")}
        </Button>
      </form>
      <section aria-label={t("decisions.title")} className="px-5">
        {loaded.status === "failed" && (
          <p className="text-sm text-muted">{t("decisions.failed")}</p>
        )}
        {loaded.status === "loaded" &&
          (loaded.decisions.length === 0 ? (
            <p className="text-sm text-muted">{t("decisions.empty")}</p>
          ) : (
            <ul>
              {loaded.decisions.map((decision) => (
                <DecisionRow decision={decision} key={decision.id} tz={deviceTz} />
              ))}
            </ul>
          ))}
      </section>
    </main>
  );
};
