import { type ReactNode, useState } from "react";

import { useLanguage } from "#web/app-state.tsx";
import { formatEyebrow } from "#web/shared/lib/eyebrow.ts";

type Props = {
  readonly title: string;
  /** Defaults to today's date in the artboard style (`TUE · OCT 6`). */
  readonly eyebrow?: string;
  /** Right-aligned slot (inbox button, totals, settings link). */
  readonly action?: ReactNode;
};

const deviceZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

export const PageHeader = ({ action, eyebrow, title }: Props) => {
  const language = useLanguage();
  // Captured at mount: every tab remounts its header, so the eyebrow is current per visit.
  const [today] = useState(() => new Date());
  return (
    <header className="flex items-end justify-between px-5 pt-6 pb-3">
      <div>
        <p className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
          {eyebrow ?? formatEyebrow(today, language, deviceZone())}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em]">{title}</h1>
      </div>
      {action}
    </header>
  );
};
