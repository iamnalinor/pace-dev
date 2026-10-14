import { type Href, usePathname, useRouter } from "expo-router";
import {
  CalendarRange,
  ChartColumn,
  Clock,
  Folder,
  History,
  Inbox,
  type LucideIcon,
  Plus,
  Settings,
  Zap,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useOwnerName, useT } from "../app-state.tsx";
import { requestNewTask } from "../shared/new-task-request.ts";
import { useWaitingCount } from "../shared/use-waiting-count.ts";
import { KeyHint } from "./button.tsx";
import { CountBadge } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { HOTKEYS } from "./hotkeys.ts";
import { PaceMark } from "./logo.tsx";
import { useTheme } from "./theme-provider.tsx";
import { useHotkey } from "./use-hotkey.tsx";

const STROKE = 1.75;

type Destination = {
  readonly href: Href;
  readonly icon: LucideIcon;
  readonly label: MessageKey;
  /** For a row that carries a count badge: its accessibility label, which takes the `{count}`. */
  readonly countedLabel?: MessageKey;
  /** Whether a path belongs to this destination (a project page belongs to Projects). */
  readonly owns: (path: string) => boolean;
};

const DESTINATIONS: readonly Destination[] = [
  {
    href: "/",
    icon: Zap,
    label: "nav.now",
    owns: (path) => path === "/" || path.startsWith("/task/"),
  },
  { href: "/day", icon: Clock, label: "nav.day", owns: (path) => path === "/day" },
  {
    href: "/week",
    icon: CalendarRange,
    label: "nav.week",
    owns: (path) => path === "/week",
  },
  {
    href: "/inbox",
    icon: Inbox,
    countedLabel: "nav.inboxWaiting",
    label: "nav.inbox",
    owns: (path) => path === "/inbox",
  },
  {
    href: "/projects",
    icon: Folder,
    label: "nav.projects",
    owns: (path) => path === "/projects" || path.startsWith("/project/"),
  },
  {
    href: "/insights",
    icon: ChartColumn,
    label: "nav.insights",
    owns: (path) => path === "/insights",
  },
  { href: "/history", icon: History, label: "nav.history", owns: (path) => path === "/history" },
  {
    href: "/settings",
    icon: Settings,
    label: "nav.settings",
    owns: (path) => ["/settings", "/devices", "/presets"].some((own) => path.startsWith(own)),
  },
];

/** The sidebar paths: on a wide window these screens are top level, with no back chevron. */
export const isSidebarPath = (path: string): boolean =>
  DESTINATIONS.some((destination) => destination.href === path);

const SidebarLink = ({
  count,
  destination,
  isCurrent,
  onPress,
}: {
  /** What waits behind this row (the Inbox's badge); 0 for a row without one. */
  readonly count: number;
  readonly destination: Destination;
  readonly isCurrent: boolean;
  readonly onPress: () => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const Icon = destination.icon;
  return (
    <Pressable
      accessibilityLabel={
        count > 0 && destination.countedLabel !== undefined
          ? t(destination.countedLabel, { count })
          : t(destination.label)
      }
      accessibilityRole="link"
      aria-current={isCurrent ? "page" : undefined}
      className={cx(
        "h-10 flex-row items-center gap-3 rounded-lg px-3 active:opacity-70",
        isCurrent && "bg-raised",
      )}
      onPress={onPress}
    >
      <Icon
        color={isCurrent ? palette.accentQuietText : palette.muted}
        size={18}
        strokeWidth={STROKE}
      />
      <Text
        className={cx(
          "flex-1 font-sans text-[14px]",
          isCurrent ? "font-medium text-fg" : "text-fg2",
        )}
      >
        {t(destination.label)}
      </Text>
      <CountBadge count={count} />
    </Pressable>
  );
};

/**
The wide window's navigation, beside every signed-in screen (pushed ones included): it
navigates by path, so a destination already open is shown again rather than stacked twice.
*/
export const Sidebar = () => {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const { palette } = useTheme();
  const owner = useOwnerName();
  const waiting = useWaitingCount();
  // The empty form opens on Now (in its right pane): asked for, and Now brought to the front.
  const newTask = (): void => {
    requestNewTask();
    if (path !== "/" && path !== "/add") {
      router.navigate("/");
    }
  };
  // Elsewhere than Now, N does the same (Now's composer takes N itself).
  useHotkey(HOTKEYS.newTask, newTask);
  return (
    <View
      aria-label={t("nav.main")}
      className="w-56 gap-1 border-r border-line bg-bg px-3 pb-4 pt-5"
      role="navigation"
    >
      <View className="mb-3 flex-row items-center gap-2 px-2">
        <PaceMark size={22} />
        <Text className="font-sans text-[16px] font-semibold text-fg">{t("app.name")}</Text>
        {owner === null ? null : (
          <Text
            className="min-w-0 flex-1 text-right font-sans text-[13px] text-muted"
            numberOfLines={1}
          >
            {owner}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityLabel={t("nav.newTask")}
        accessibilityRole="button"
        className="mb-3 h-10 flex-row items-center gap-2 rounded-lg bg-accent px-3 active:opacity-80"
        onPress={newTask}
      >
        <Plus color={palette.accentFg} size={18} strokeWidth={STROKE} />
        <Text className="flex-1 font-sans text-[14px] font-medium text-accentFg">
          {t("nav.newTask")}
        </Text>
        <KeyHint hotkey={HOTKEYS.newTask} variant="primary" />
      </Pressable>
      {DESTINATIONS.map((destination) => (
        <SidebarLink
          count={destination.countedLabel === undefined ? 0 : waiting}
          destination={destination}
          isCurrent={destination.owns(path)}
          key={destination.label}
          onPress={() => {
            router.navigate(destination.href);
          }}
        />
      ))}
    </View>
  );
};
