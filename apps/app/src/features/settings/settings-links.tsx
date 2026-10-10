import { type Href, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

type Entry = {
  readonly to: Href;
  readonly titleKey: MessageKey;
  readonly hintKey: MessageKey;
  readonly count?: number;
};

const LinkRow = ({ count = 0, hintKey, titleKey, to }: Entry) => {
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
      {count > 0 ? (
        <Text className="font-sans text-[13px] tabular-nums text-fg2">{count}</Text>
      ) : null}
      <ChevronRight color={palette.faint} size={16} strokeWidth={1.75} />
    </Pressable>
  );
};

/**
The settings that live on their own pages: presets, the review block, history (beside the
sidebar it is there already), the notification log.
*/
export const SettingsLinks = () => {
  const { count } = usePace().hooks.useReview();
  const isWide = useIsWide();
  return (
    <View>
      <LinkRow hintKey="settings.presets.hint" titleKey="settings.presets" to="/presets" />
      <LinkRow
        count={count}
        hintKey="settings.review.hint"
        titleKey="settings.review"
        to="/review"
      />
      {isWide ? null : (
        <LinkRow hintKey="settings.history.hint" titleKey="settings.history" to="/history" />
      )}
      <LinkRow hintKey="settings.decisions.hint" titleKey="settings.decisions" to="/decisions" />
    </View>
  );
};
