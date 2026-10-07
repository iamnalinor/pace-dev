import { useRouter } from "expo-router";
import { Inbox, Settings } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useLanguage, usePace, useT } from "#app/app-state.tsx";
import { eyebrowDate } from "#app/format/date.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

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
      <Text className="font-mono text-[13px] text-fg">{count}</Text>
    </Pressable>
  );
};

/** Date eyebrow and "Now"; on the right "To sort" (when anything waits), Inbox and Settings. */
export const NowHeader = ({ inboxCount }: { readonly inboxCount: number }) => {
  const t = useT();
  const router = useRouter();
  const language = useLanguage();
  const { hooks } = usePace();
  const { deviceTz, now } = hooks.useClock();
  const review = hooks.useReview();
  return (
    <ScreenHeader
      eyebrow={eyebrowDate(now, deviceTz, language)}
      right={
        <View className="flex-row gap-2">
          {review.count === 0 ? null : (
            <CounterButton
              count={review.count}
              label={`${t("review.title")}, ${review.count}`}
              onPress={() => {
                router.push("/review");
              }}
              title={t("review.title")}
            />
          )}
          <CounterButton
            count={inboxCount}
            label={t("now.inbox", { count: inboxCount })}
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
