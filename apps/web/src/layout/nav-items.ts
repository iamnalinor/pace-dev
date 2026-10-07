import {
  BarChart3,
  Clock,
  Folder,
  History,
  Inbox,
  type LucideIcon,
  Settings,
  Zap,
} from "lucide-react";

import type { MessageKey } from "@pace/core";

export type NavItem = {
  readonly to: string;
  readonly labelKey: MessageKey;
  readonly icon: LucideIcon;
  /** Shows the unsorted-inbox count beside the label. */
  readonly hasInboxCount?: boolean;
};

/** The wide screens' navigation: every section, labelled (the phone tab bar keeps five). */
export const NAV_ITEMS: readonly NavItem[] = [
  { icon: Zap, labelKey: "nav.now", to: "/" },
  { icon: Clock, labelKey: "nav.day", to: "/day" },
  { hasInboxCount: true, icon: Inbox, labelKey: "nav.inbox", to: "/inbox" },
  { icon: Folder, labelKey: "nav.projects", to: "/projects" },
  { icon: BarChart3, labelKey: "nav.insights", to: "/insights" },
  { icon: History, labelKey: "nav.history", to: "/history" },
  { icon: Settings, labelKey: "nav.settings", to: "/settings" },
];
