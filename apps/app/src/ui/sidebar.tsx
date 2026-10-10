import { type Href, usePathname, useRouter } from "expo-router";
import {
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

import { useT } from "../app-state.tsx";
import { cx } from "./cx.ts";
import { PaceMark } from "./logo.tsx";
import { useTheme } from "./theme-provider.tsx";

const STROKE = 1.75;

type Destination = {
  readonly href: Href;
  readonly icon: LucideIcon;
  readonly label: MessageKey;
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
  { href: "/inbox", icon: Inbox, label: "nav.inbox", owns: (path) => path === "/inbox" },
  { href: "/history", icon: History, label: "nav.history", owns: (path) => path === "/history" },
  {
    href: "/settings",
    icon: Settings,
    label: "nav.settings",
    owns: (path) => path === "/settings" || path.startsWith("/presets"),
  },
];

/** The sidebar paths: on a wide window these screens are top level, with no back chevron. */
export const isSidebarPath = (path: string): boolean =>
  DESTINATIONS.some((destination) => destination.href === path);

const SidebarLink = ({
  destination,
  isCurrent,
  onPress,
}: {
  readonly destination: Destination;
  readonly isCurrent: boolean;
  readonly onPress: () => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const Icon = destination.icon;
  return (
    <Pressable
      accessibilityRole="link"
      aria-current={isCurrent ? "page" : undefined}
      className={cx(
        "h-10 flex-row items-center gap-3 rounded-lg px-3 active:opacity-70",
        isCurrent && "bg-raised",
      )}
      onPress={onPress}
    >
      <Icon color={isCurrent ? palette.fg : palette.muted} size={18} strokeWidth={STROKE} />
      <Text className={cx("font-sans text-[14px]", isCurrent ? "font-medium text-fg" : "text-fg2")}>
        {t(destination.label)}
      </Text>
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
  return (
    <View
      aria-label={t("nav.main")}
      className="w-56 gap-1 border-r border-line bg-bg px-3 pb-4 pt-5"
      role="navigation"
    >
      <View className="mb-3 flex-row items-center gap-2 px-2">
        <PaceMark size={22} />
        <Text className="font-sans text-[16px] font-semibold text-fg">{t("app.name")}</Text>
      </View>
      <Pressable
        accessibilityLabel={t("nav.newTask")}
        accessibilityRole="button"
        className="mb-3 h-10 flex-row items-center gap-2 rounded-lg bg-accent px-3 active:opacity-80"
        onPress={() => {
          router.navigate("/add");
        }}
      >
        <Plus color={palette.accentFg} size={18} strokeWidth={STROKE} />
        <Text className="font-sans text-[14px] font-medium text-accentFg">{t("nav.newTask")}</Text>
      </Pressable>
      {DESTINATIONS.map((destination) => (
        <SidebarLink
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
