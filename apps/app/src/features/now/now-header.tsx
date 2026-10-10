import { useRouter } from "expo-router";
import { Inbox, Settings } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useLanguage, usePace, useT } from "#app/app-state.tsx";
import { decisionsOf } from "#app/screens/review-card.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { formatEyebrow } from "@pace/core";

const CounterButton = ({
  count,
  label,
  onPress,
  title,
}: {
  readonly count: number;
  readonly label: string;
  readonly onPress: () => void;
  readonly title?: string;
}) => {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-11 flex-row items-center gap-2 rounded-md border border-line bg-surface px-3 active:opacity-80"
      onPress={onPress}
    >
      {title === undefined ? (
        <Inbox color={palette.fg} size={18} strokeWidth={1.75} />
      ) : (
        <Text className="font-sans text-[13px] text-fg">{title}</Text>
      )}
      <Text className="font-sans text-[13px] tabular-nums text-fg">{count}</Text>
    </Pressable>
  );
};

/** Date eyebrow and "Now"; on the right the Inbox (captures and decisions) and Settings. */
export const NowHeader = ({ inboxCount }: { readonly inboxCount: number }) => {
  const t = useT();
  const router = useRouter();
  const language = useLanguage();
  const { hooks } = usePace();
  const { deviceTz, now } = hooks.useClock();
  // One Inbox: the captures and the decisions the rules want.
  const waiting = inboxCount + decisionsOf(hooks.useReview().items).length;
  return (
    <ScreenHeader
      eyebrow={formatEyebrow(now, deviceTz, language)}
      right={
        <View className="flex-row gap-2">
          <CounterButton
            count={waiting}
            label={t("now.inbox", { count: waiting })}
            onPress={() => {
              router.push("/inbox");
            }}
          />
          <IconButton
            icon={Settings}
            label={t("nav.settings")}
            onPress={() => {
              router.push("/settings");
            }}
          />
        </View>
      }
      title={t("nav.now")}
    />
  );
};
