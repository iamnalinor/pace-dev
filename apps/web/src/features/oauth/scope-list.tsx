import { useId } from "react";

import type { OAuthScope } from "@pace/core";

import { useT } from "#web/i18n.tsx";

import { SCOPE_KEYS } from "./scopes.ts";

type Props = {
  readonly offered: readonly OAuthScope[];
  readonly chosen: readonly OAuthScope[];
  readonly onToggle: (scope: OAuthScope) => void;
};

/** The requested scopes as plain-language checkboxes, all ticked until the person unticks one. */
export const ScopeList = ({ chosen, offered, onToggle }: Props) => {
  const t = useT();
  const groupId = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
        {t("oauth.scopesTitle")}
      </legend>
      {offered.map((scope) => {
        const id = `${groupId}-${scope}`;
        return (
          <label
            className="flex items-center gap-3 rounded-md border border-line px-3 py-2 text-sm"
            htmlFor={id}
            key={scope}
          >
            <input
              checked={chosen.includes(scope)}
              className="size-4 accent-accent"
              id={id}
              onChange={() => {
                onToggle(scope);
              }}
              type="checkbox"
            />
            <span>{t(SCOPE_KEYS[scope])}</span>
          </label>
        );
      })}
    </fieldset>
  );
};
