import type { ComponentProps } from "react";

import { type Tabs, useRouter } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "../app-state.tsx";
import { cx } from "./cx.ts";
import { useIsWide } from "./layout.ts";
import { PaceMark } from "./logo.tsx";
import { useTheme } from "./theme-provider.tsx";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ICONS: Readonly<Record<string, LucideIcon>> = {
  add: Plus,
  day: Clock,
  index: Zap,
  insights: ChartColumn,
  projects: Folder,
};

const ICON_SIZE = 20;
const STROKE = 1.75;

/** Bottom tabs from the Main artboard: five 56×44 targets, the Add one a filled light square. */
const BottomTabs = ({ descriptors, navigation, state }: TabBarProps) => {
  const t = useT();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      aria-label={t("nav.main")}
      className="flex-row justify-around border-t border-line bg-bg px-3 pt-2"
      role="tablist"
      style={{ paddingBottom: Math.max(insets.bottom, 12) + 8 }}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const isAdd = route.name === "add";
        const Icon = ICONS[route.name] ?? Zap;
        const activeColor = isFocused ? palette.fg : palette.faint;
        const onPress = (): void => {
          const event = navigation.emit({
            canPreventDefault: true,
            target: route.key,
            type: "tabPress",
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        return (
          <Pressable
            accessibilityLabel={descriptors[route.key]?.options.title ?? route.name}
            accessibilityRole="tab"
            aria-selected={isFocused}
            className={cx(
              "h-11 w-14 items-center justify-center",
              isAdd && "rounded-lg bg-inverse",
            )}
            key={route.key}
            onPress={onPress}
          >
            <Icon
              color={isAdd ? palette.inverseFg : activeColor}
              size={ICON_SIZE}
              strokeWidth={STROKE}
            />
          </Pressable>
        );
      })}
    </View>
  );
};

/** A tab of the sidebar (`isActive` set), or a link to a pushed screen (without it). */
const SidebarLink = ({
  icon: Icon,
  isActive,
  label,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly isActive?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) => {
  const { palette } = useTheme();
  const isCurrent = isActive === true;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={isActive === undefined ? "link" : "tab"}
      aria-selected={isActive}
      className={cx(
        "h-10 flex-row items-center gap-3 rounded-lg px-3 active:opacity-70",
        isCurrent && "bg-raised",
      )}
      onPress={onPress}
    >
      <Icon color={isCurrent ? palette.fg : palette.muted} size={18} strokeWidth={STROKE} />
      <Text className={cx("font-sans text-[14px]", isCurrent ? "text-fg" : "text-fg2")}>
        {label}
      </Text>
    </Pressable>
  );
};

/** On a wide window the tabs become a sidebar, with the pushed screens (Inbox, History, Settings) below. */
const Sidebar = ({ descriptors, navigation, state }: TabBarProps) => {
  const t = useT();
  const router = useRouter();
  const { palette } = useTheme();
  const tabs = state.routes.filter((route) => route.name !== "add");
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
          navigation.navigate("add");
        }}
      >
        <Plus color={palette.accentFg} size={18} strokeWidth={STROKE} />
        <Text className="font-sans text-[14px] font-medium text-accentFg">{t("nav.newTask")}</Text>
      </Pressable>
      <View className="gap-1" role="tablist">
        {tabs.map((route) => (
          <SidebarLink
            icon={ICONS[route.name] ?? Zap}
            isActive={state.routes[state.index]?.key === route.key}
            key={route.key}
            label={descriptors[route.key]?.options.title ?? route.name}
            onPress={() => {
              navigation.navigate(route.name, route.params);
            }}
          />
        ))}
      </View>
      <SidebarLink
        icon={Inbox}
        label={t("nav.inbox")}
        onPress={() => {
          router.push("/inbox");
        }}
      />
      <SidebarLink
        icon={History}
        label={t("nav.history")}
        onPress={() => {
          router.push("/history");
        }}
      />
      <SidebarLink
        icon={Settings}
        label={t("nav.settings")}
        onPress={() => {
          router.push("/settings");
        }}
      />
    </View>
  );
};

/** Bottom tabs on a phone, a sidebar on a wide window. */
export const TabBar = (props: TabBarProps) =>
  useIsWide() ? <Sidebar {...props} /> : <BottomTabs {...props} />;
