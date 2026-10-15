import { type Href, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

type Entry = {
  readonly to: Href;
  readonly titleKey: MessageKey;
  readonly hintKey: MessageKey;
};

const LinkRow = ({ hintKey, titleKey, to }: Entry) => {
  const t = useT();
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      className="min-h-14 flex-row items-center gap-3 border-t border-line py-2 active:opacity-70"
      onPress={() => {
        router.push(to);
      }}
    >
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-[15px] text-fg">{t(titleKey)}</Text>
        <Text className="font-sans text-[12px] text-muted">{t(hintKey)}</Text>
      </View>
      <ChevronRight color={palette.faint} size={16} strokeWidth={1.75} />
    </Pressable>
  );
};

/**
The settings that live on their own pages: presets. History is a row of More on a phone and of
the sidebar beside it; the decisions to sort are on the Inbox; the assistant's log is on the
notifications page.
*/
export const SettingsLinks = () => {
  return (
    <View>
      <LinkRow hintKey="settings.presets.hint" titleKey="settings.presets" to="/presets" />
    </View>
  );
};
