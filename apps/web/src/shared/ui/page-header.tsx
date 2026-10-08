import type { ReactNode } from "react";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { formatEyebrow } from "@pace/core";

type Props = {
  readonly title: string;
  /** Defaults to today's date in the artboard style (`TUE · OCT 6`). */
  readonly eyebrow?: string;
  /** Right-aligned slot (inbox button, totals, settings link). */
  readonly action?: ReactNode;
};

export const PageHeader = ({ action, eyebrow, title }: Props) => {
  const language = useLanguage();
  // The client clock (frozen in tests) on the device's calendar, refreshed every 30 s.
  const { deviceTz, now } = useServices().hooks.useClock();
  return (
    <header className="flex items-end justify-between px-5 pt-6 pb-3">
      <div>
        <p className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
          {eyebrow ?? formatEyebrow(now, deviceTz, language)}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em]">{title}</h1>
      </div>
      {action}
    </header>
  );
};
