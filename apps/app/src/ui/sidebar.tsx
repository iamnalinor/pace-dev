import { type Href, usePathname, useRouter } from "expo-router";
import { Text as NativeText, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useT } from "../app-state.tsx";
import { requestNewTask } from "../shared/new-task-request.ts";
import { NotificationBell } from "../shared/notifications/notification-bell.tsx";
import { useWaitingCount } from "../shared/use-waiting-count.ts";
import { KeyHint } from "./button.tsx";
import { HOTKEYS } from "./hotkeys.ts";
import { Icon, type IconName } from "./icon.tsx";
import { PaceMark } from "./logo.tsx";
import { ARIA_CURRENT, type NavCurrent, NavItem } from "./nav-item.tsx";
import { Pressable } from "./pressable.tsx";
import { Text } from "./text.tsx";
import { useHotkey } from "./use-hotkey.tsx";

export type Destination = {
  readonly href: Href;
  readonly icon: IconName;
  readonly label: MessageKey;
  /** For a row that carries a count badge: its accessibility label, which takes the `{count}`. */
  readonly countedLabel?: MessageKey;
  /** Whether a path belongs to this destination (a project page belongs to Projects). */
  readonly owns: (path: string) => boolean;
};

/** The eight destinations, in order: the sidebar and the rail list them all (spec §5.0.1). */
export const DESTINATIONS: readonly Destination[] = [
  {
    href: "/",
    icon: "zap",
    label: "nav.now",
    owns: (path) => path === "/" || path.startsWith("/task/"),
  },
  { href: "/day", icon: "clock", label: "nav.day", owns: (path) => path === "/day" },
  {
    href: "/week",
    icon: "calendar-range",
    label: "nav.week",
    owns: (path) => path === "/week",
  },
  {
    href: "/inbox",
    icon: "inbox",
    countedLabel: "nav.inboxWaiting",
    label: "nav.inbox",
    owns: (path) => path === "/inbox",
  },
  {
    href: "/projects",
    icon: "folder",
    label: "nav.projects",
    owns: (path) => path === "/projects" || path.startsWith("/project/"),
  },
  {
    href: "/insights",
    icon: "chart-column",
    label: "nav.insights",
    owns: (path) => path === "/insights",
  },
  { href: "/history", icon: "history", label: "nav.history", owns: (path) => path === "/history" },
  {
    href: "/settings",
    icon: "settings",
    label: "nav.settings",
    owns: (path) => ["/settings", "/presets"].some((own) => path.startsWith(own)),
  },
];

/** Where the person is, for one destination: its own page, a screen it owns, or elsewhere. */
export const currentOf = (destination: Destination, path: string): NavCurrent => {
  if (path === destination.href || (path === "/add" && destination.href === "/")) {
    return "page";
  }
  return destination.owns(path) ? "section" : null;
};

/** A destination link of the navigation (the sidebar's row, the rail's item). */
export type DestinationLinkProps = {
  /** What waits behind it (the Inbox's badge); 0 for one without. */
  readonly count: number;
  readonly destination: Destination;
  readonly current: NavCurrent;
};

/**
What every destination link says: its address, `aria-current` (`page` on its own page, `true` on a
screen it owns), and its name for screen readers with what waits behind it, if anything.
*/
export const useDestinationLink = ({ count, current, destination }: DestinationLinkProps) => {
  const t = useT();
  return {
    "aria-current": current === null ? undefined : ARIA_CURRENT[current],
    href: destination.href,
    label:
      count > 0 && destination.countedLabel !== undefined
        ? t(destination.countedLabel, { count })
        : t(destination.label),
  };
};

/** The sidebar paths: on a wide window these screens are top level, with no back chevron. */
export const isSidebarPath = (path: string): boolean =>
  DESTINATIONS.some((destination) => destination.href === path);

/**
A destination: a `NavItem`, a link with its address (`<a href>` on the web, so Ctrl/⌘-click opens it
in a new tab; F-WEB-03). It navigates rather than pushes, so a destination already open is shown
again.
*/
const SidebarLink = (props: DestinationLinkProps) => {
  const t = useT();
  const { count, current, destination } = props;
  const { href, label } = useDestinationLink(props);
  return (
    <NavItem
      count={count}
      current={current}
      href={href}
      icon={destination.icon}
      label={label}
      title={t(destination.label)}
    />
  );
};

/**
The sidebar's header (spec §5.0.1, §4.2.22): the mark, «Pace» and the bell on one row. No profile
name (owner 2026-11-08): who is signed in is said in Settings, by the account's actions.
*/
export const SidebarHeader = () => {
  const t = useT();
  return (
    <View className="mb-3 min-h-hit-web flex-row items-center gap-2 px-3" testID="sidebar-header">
      <PaceMark size={22} />
      <Text className="flex-1" role="headline">
        {t("app.name")}
      </Text>
      <NotificationBell place="sidebar" />
    </View>
  );
};

/**
New task from the navigation (the sidebar's button, the rail's top button): the empty form opens
on Now, which is brought to the front. Elsewhere than Now, N does the same (Now's composer takes N
itself).
*/
export const useNewTask = (): (() => void) => {
  const router = useRouter();
  const path = usePathname();
  const newTask = (): void => {
    requestNewTask();
    if (path !== "/" && path !== "/add") {
      router.navigate("/");
    }
  };
  useHotkey(HOTKEYS.newTask, newTask);
  return newTask;
};

/**
The wide window's navigation (spec §4.2.22), beside every signed-in screen (pushed ones included):
the header, New task (the shell's one filled accent, with its key), and the eight destinations as
`NavItem`s. It navigates by path, so a destination already open is shown again rather than stacked
twice.
*/
export const Sidebar = () => {
  const t = useT();
  const path = usePathname();
  const waiting = useWaitingCount();
  const newTask = useNewTask();
  return (
    <View
      aria-label={t("nav.main")}
      className="w-sidebar gap-1 border-r border-separator bg-sidebar px-3 pb-4 pt-4"
      role="navigation"
    >
      <SidebarHeader />
      <Pressable
        className="mb-3 min-h-hit-web flex-row items-center gap-2 rounded-md bg-accent px-3"
        label={t("nav.newTask")}
        onPress={newTask}
        role="button"
      >
        <Icon name="plus" tone="onAccent" />
        <NativeText className="flex-1 font-sans text-callout font-medium text-accent-on">
          {t("nav.newTask")}
        </NativeText>
        <KeyHint hotkey={HOTKEYS.newTask} variant="primary" />
      </Pressable>
      {DESTINATIONS.map((destination) => (
        <SidebarLink
          count={destination.countedLabel === undefined ? 0 : waiting}
          current={currentOf(destination, path)}
          destination={destination}
          key={destination.label}
        />
      ))}
    </View>
  );
};
