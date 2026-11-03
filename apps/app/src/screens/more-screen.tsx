import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useOwnerName, useT } from "#app/app-state.tsx";
import { UserAvatar } from "#app/shared/user-avatar.tsx";
import { Icon, type IconName } from "#app/ui/icon.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { Text as KitText } from "#app/ui/text.tsx";

type Row = {
  readonly href: Href;
  readonly icon: IconName;
  readonly label: MessageKey;
};

/** What a phone keeps behind More: the sidebar's other destinations, Week first. */
const ROWS: readonly Row[] = [
  { href: "/week", icon: "calendar-range", label: "nav.week" },
  { href: "/projects", icon: "folder", label: "nav.projects" },
  { href: "/insights", icon: "chart-column", label: "nav.insights" },
  { href: "/history", icon: "history", label: "nav.history" },
  { href: "/settings", icon: "settings", label: "nav.settings" },
];

const MoreRow = ({ href, icon, label }: Row) => {
  const t = useT();
  const router = useRouter();
  return (
    <Pressable
      accessibilityLabel={t(label)}
      accessibilityRole="link"
      className="min-h-row flex-row items-center gap-3 border-b border-separator px-5 active:opacity-70"
      onPress={() => {
        router.push(href);
      }}
    >
      <Icon name={icon} />
      <Text className="flex-1 font-sans text-body text-label-primary">{t(label)}</Text>
      <Icon name="chevron-right" size="inline" tone="tertiary" />
    </Pressable>
  );
};

/** The owner's first name from Telegram, with an initial in the quiet accent. */
const Owner = ({ name }: { readonly name: string }) => (
  <View className="mx-5 mb-3 flex-row items-center gap-3">
    <UserAvatar />
    <KitText className="flex-1 font-medium" policy="truncate" role="headline">
      {name}
    </KitText>
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
      <View className="border-t border-separator">
        {ROWS.map((row) => (
          <MoreRow key={row.label} {...row} />
        ))}
      </View>
    </Screen>
  );
};
