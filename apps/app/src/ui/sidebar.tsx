import { type Href, usePathname, useRouter } from "expo-router";
import { Text as NativeText, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useOwnerName, useT } from "../app-state.tsx";
import { requestNewTask } from "../shared/new-task-request.ts";
import { NotificationBell } from "../shared/notifications/notification-bell.tsx";
import { useWaitingCount } from "../shared/use-waiting-count.ts";
import { UserAvatar } from "../shared/user-avatar.tsx";
import { KeyHint } from "./button.tsx";
import { CountBadge } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { HOTKEYS } from "./hotkeys.ts";
import { Icon, type IconName } from "./icon.tsx";
import { Link } from "./link.tsx";
import { PaceMark } from "./logo.tsx";
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

/** A destination link of the navigation (the sidebar's row, the rail's item). */
export type DestinationLinkProps = {
  /** What waits behind it (the Inbox's badge); 0 for one without. */
  readonly count: number;
  readonly destination: Destination;
  readonly isCurrent: boolean;
};

/**
What every destination link says: its address, `aria-current="page"` when it is the current one,
and its name for screen readers with what waits behind it, if anything.
*/
export const useDestinationLink = ({ count, destination, isCurrent }: DestinationLinkProps) => {
  const t = useT();
  return {
    "aria-current": isCurrent ? ("page" as const) : undefined,
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
A destination: a link with its address (`<a href>` on the web, so Ctrl/⌘-click opens it in a new
tab; F-WEB-03). It navigates rather than pushes, so a destination already open is shown again.
*/
const SidebarLink = (props: DestinationLinkProps) => {
  const t = useT();
  const { count, destination, isCurrent } = props;
  const link = useDestinationLink(props);
  return (
    <Link
      {...link}
      className={cx("h-10 flex-row items-center gap-3 rounded-lg px-3", isCurrent && "bg-fill-3")}
    >
      <Icon name={destination.icon} tone={isCurrent ? "accent" : "secondary"} />
      <NativeText
        className={cx(
          "flex-1 font-sans text-subhead",
          isCurrent ? "text-label-primary" : "font-normal text-label-secondary",
        )}
      >
        {t(destination.label)}
      </NativeText>
      <CountBadge count={count} />
    </Link>
  );
};

/** The mark, the name and the bell; who is signed in on a line of its own beneath. */
export const SidebarHeader = ({ owner }: { readonly owner: null | string }) => {
  const t = useT();
  return (
    <>
      <View className="flex-row items-center gap-2 px-2">
        <PaceMark size={22} />
        <NativeText className="flex-1 font-sans text-body font-semibold text-label-primary">
          {t("app.name")}
        </NativeText>
        <NotificationBell variant="plain" />
      </View>
      {/* Who is signed in, on a line of its own: beside the logo and the bell it had 23 px (QA 17 M6). */}
      {owner === null ? (
        <View className="mb-2" />
      ) : (
        <View
          accessibilityLabel={t("nav.signedInAs", { name: owner })}
          accessible
          className="mb-3 flex-row items-center gap-2 px-2"
        >
          <UserAvatar size={24} />
          <Text className="flex-1" policy="truncate" role="footnote" tone="secondary">
            {owner}
          </Text>
        </View>
      )}
    </>
  );
};

/**
The wide window's navigation, beside every signed-in screen (pushed ones included): it
navigates by path, so a destination already open is shown again rather than stacked twice.
*/
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

export const Sidebar = () => {
  const t = useT();
  const path = usePathname();
  const owner = useOwnerName();
  const waiting = useWaitingCount();
  const newTask = useNewTask();
  return (
    <View
      aria-label={t("nav.main")}
      className="w-sidebar gap-1 border-r border-separator bg-sidebar px-3 pb-4 pt-5"
      role="navigation"
    >
      <SidebarHeader owner={owner} />
      <Pressable
        className="mb-3 h-10 flex-row items-center gap-2 rounded-lg bg-accent px-3"
        label={t("nav.newTask")}
        onPress={newTask}
        role="button"
      >
        <Icon name="plus" tone="onAccent" />
        <NativeText className="flex-1 font-sans text-subhead text-accent-on">
          {t("nav.newTask")}
        </NativeText>
        <KeyHint hotkey={HOTKEYS.newTask} variant="primary" />
      </Pressable>
      {DESTINATIONS.map((destination) => (
        <SidebarLink
          count={destination.countedLabel === undefined ? 0 : waiting}
          destination={destination}
          isCurrent={destination.owns(path)}
          key={destination.label}
        />
      ))}
    </View>
  );
};
