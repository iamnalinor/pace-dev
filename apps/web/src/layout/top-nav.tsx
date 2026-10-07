import { Plus } from "lucide-react";
import { Link } from "react-router";

import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { PaceMark } from "#web/shared/ui/pace-mark.tsx";

import { NavLinks } from "./nav-links.tsx";

const itemClass = ({ isActive }: { readonly isActive: boolean }): string =>
  cn(
    "flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap no-underline transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
    isActive ? "bg-raised font-medium text-fg" : "text-fg2 hover:text-fg",
  );

/** 640–1023px: one wider column with the sections across the top. */
export const TopNav = ({ className }: { readonly className?: string }) => {
  const t = useT();
  return (
    <header
      className={cn(
        "sticky top-0 z-30 items-center gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur-sm",
        className,
      )}
    >
      <PaceMark className="size-5 shrink-0" />
      <NavLinks className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" itemClass={itemClass} />
      <Link
        aria-label={t("nav.newTask")}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accentFg outline-none hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-accent/40"
        title={t("nav.newTask")}
        to="/add"
      >
        <Plus aria-hidden="true" className="size-4" />
      </Link>
    </header>
  );
};
