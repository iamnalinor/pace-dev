import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

import type { MessageKey } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";

type Entry = {
  readonly to: string;
  readonly titleKey: MessageKey;
  readonly hintKey: MessageKey;
  readonly count?: number;
};

const Row = ({ count = 0, hintKey, titleKey, to }: Entry) => {
  const t = useT();
  return (
    <li>
      <Link
        className="flex min-h-14 items-center gap-3 rounded-md py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
        to={to}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-fg">{t(titleKey)}</span>
          <span className="block text-xs text-muted">{t(hintKey)}</span>
        </span>
        {count > 0 && <span className="font-mono text-[13px] text-fg2">{count}</span>}
        <ChevronRight aria-hidden="true" className="size-4 text-faint" strokeWidth={1.75} />
      </Link>
    </li>
  );
};

/** The settings that live on their own pages: presets, the review block, history. */
export const SettingsLinks = () => {
  const { count } = useServices().hooks.useReview();
  return (
    <ul className="grid divide-y divide-line">
      <Row hintKey="settings.presets.hint" titleKey="settings.presets" to="/settings/presets" />
      <Row count={count} hintKey="settings.review.hint" titleKey="settings.review" to="/review" />
      <Row hintKey="settings.history.hint" titleKey="settings.history" to="/history" />
      <Row hintKey="settings.decisions.hint" titleKey="settings.decisions" to="/decisions" />
    </ul>
  );
};
