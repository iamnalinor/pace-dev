import { Inbox, Settings } from "lucide-react";
import { Link } from "react-router";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

/** The header's right side: the unsorted-inbox counter and the way to settings. */
export const NowHeaderActions = ({ inboxCount }: { readonly inboxCount: number }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <Link
        aria-label={t("now.inbox", { count: inboxCount })}
        className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] text-fg no-underline transition-colors outline-none hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-accent/40"
        to="/inbox"
      >
        <Inbox aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        <span className="font-mono">{inboxCount}</span>
      </Link>
      {/* From 1024px Settings sits in the sidebar. */}
      <Button asChild className="lg:hidden" size="icon" variant="ghost">
        <Link aria-label={t("nav.settings")} title={t("nav.settings")} to="/settings">
          <Settings aria-hidden="true" strokeWidth={1.75} />
        </Link>
      </Button>
    </div>
  );
};
