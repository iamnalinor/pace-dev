import { type Href, useRouter } from "expo-router";
import {
  CalendarRange,
  ChartColumn,
  ChevronRight,
  Folder,
  History,
  type LucideIcon,
  Settings,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useOwnerName, useT } from "#app/app-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

type Row = {
  readonly href: Href;
  readonly icon: LucideIcon;
  readonly label: MessageKey;
};

/** What a phone keeps behind More: the sidebar's other destinations, Week first. */
const ROWS: readonly Row[] = [
  { href: "/week", icon: CalendarRange, label: "nav.week" },
  { href: "/projects", icon: Folder, label: "nav.projects" },
  { href: "/insights", icon: ChartColumn, label: "nav.insights" },
  { href: "/history", icon: History, label: "nav.history" },
  { href: "/settings", icon: Settings, label: "nav.settings" },
];

const MoreRow = ({ href, icon: Icon, label }: Row) => {
  const t = useT();
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={t(label)}
      accessibilityRole="link"
      className="min-h-14 flex-row items-center gap-3 border-b border-line px-5 active:opacity-70"
      onPress={() => {
        router.push(href);
      }}
    >
      <Icon color={palette.muted} size={20} strokeWidth={1.75} />
      <Text className="flex-1 font-sans text-[16px] text-fg">{t(label)}</Text>
      <ChevronRight color={palette.faint} size={16} strokeWidth={1.75} />
    </Pressable>
  );
};

/** The owner's first name from Telegram, with an initial in the quiet accent. */
const Owner = ({ name }: { readonly name: string }) => (
  <View className="mx-5 mb-3 flex-row items-center gap-3">
    <View className="size-11 items-center justify-center rounded-full bg-accentQuiet">
      <Text className="font-sans text-[18px] font-semibold uppercase text-accentQuietFg">
        {name.slice(0, 1)}
      </Text>
    </View>
    <Text className="min-w-0 flex-1 font-sans text-[18px] font-medium text-fg" numberOfLines={1}>
      {name}
    </Text>
  </View>
);

/**
The phone's last tab: the owner's name at the top, then the rows that did not fit the tab bar.
A wide window has them all in the sidebar and never shows this.
*/
export const MoreScreen = () => {
  const t = useT();
  const owner = useOwnerName();
  return (
    <Screen header={<ScreenHeader title={t("nav.more")} />}>
      {owner === null ? null : <Owner name={owner} />}
      <View className="border-t border-line">
        {ROWS.map((row) => (
          <MoreRow key={row.label} {...row} />
        ))}
      </View>
    </Screen>
  );
};
