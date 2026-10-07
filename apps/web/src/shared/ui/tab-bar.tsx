import { BarChart3, Clock, Folder, type LucideIcon, Plus, Zap } from "lucide-react";
import { NavLink } from "react-router";

import type { MessageKey } from "@pace/core";

import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";

type Tab = {
  readonly to: string;
  readonly labelKey: MessageKey;
  readonly icon: LucideIcon;
  /** The Add tab is a filled square, the artboards' primary action. */
  readonly isPrimary?: boolean;
};

const TABS: readonly Tab[] = [
  { icon: Zap, labelKey: "nav.now", to: "/" },
  { icon: Clock, labelKey: "nav.day", to: "/day" },
  { icon: Plus, isPrimary: true, labelKey: "nav.add", to: "/add" },
  { icon: Folder, labelKey: "nav.projects", to: "/projects" },
  { icon: BarChart3, labelKey: "nav.insights", to: "/insights" },
];

const tone = (tab: Tab, isActive: boolean): string => {
  if (tab.isPrimary === true) {
    return "bg-inverse text-inverseFg";
  }
  return isActive ? "text-fg" : "text-faint hover:text-fg2";
};

const tabClass = (tab: Tab, isActive: boolean): string =>
  cn(
    "flex h-11 w-14 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
    tone(tab, isActive),
  );

/** The bottom navigation: Now, Day, Add, Projects, Insights. */
export const TabBar = () => {
  const t = useT();
  return (
    <nav
      aria-label={t("nav.main")}
      className="flex justify-around border-t border-line px-3 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
    >
      {TABS.map((tab) => (
        <NavLink
          aria-label={t(tab.labelKey)}
          className={({ isActive }) => tabClass(tab, isActive)}
          end={tab.to === "/"}
          key={tab.to}
          title={t(tab.labelKey)}
          to={tab.to}
        >
          <tab.icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </NavLink>
      ))}
    </nav>
  );
};
