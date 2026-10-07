import { Plus } from "lucide-react";
import { Link } from "react-router";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { PaceMark } from "#web/shared/ui/pace-mark.tsx";

import { NavLinks } from "./nav-links.tsx";

const itemClass = ({ isActive }: { readonly isActive: boolean }): string =>
  cn(
    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm no-underline transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
    isActive ? "bg-raised font-medium text-fg" : "text-fg2 hover:bg-raised/60 hover:text-fg",
  );

/** From 1024px: the left rail with every section, the inbox count and "New task". */
export const Sidebar = ({ className }: { readonly className?: string }) => {
  const t = useT();
  const inboxCount = useServices().hooks.useInbox().count;
  return (
    <aside
      className={cn(
        "sticky top-0 h-dvh w-56 shrink-0 flex-col gap-4 border-r border-line bg-surface/40 px-3 py-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-2.5">
        <PaceMark className="size-6" />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">{t("app.name")}</span>
      </div>
      <Link
        className="flex h-9 items-center gap-2 rounded-md bg-accent px-2.5 text-sm font-medium text-accentFg no-underline outline-none hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-accent/40"
        to="/add"
      >
        <Plus aria-hidden="true" className="size-4" />
        {t("nav.newTask")}
        <kbd className="ml-auto font-mono text-[11px] opacity-70">N</kbd>
      </Link>
      <NavLinks className="flex flex-col gap-0.5" inboxCount={inboxCount} itemClass={itemClass} />
      <p className="mt-auto px-2.5 text-xs text-muted">{t("shortcuts.hint")}</p>
    </aside>
  );
};
