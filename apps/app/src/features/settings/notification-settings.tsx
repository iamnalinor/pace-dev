import { X } from "lucide-react-native";
import { Text, View } from "react-native";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";

/** The daily digest times (`HH:MM` on the account's zone); every change is saved at once. */
export const DigestWindows = () => {
  const t = useT();
  const { actions } = usePace();
  const { digestWindows } = useSettings();
  const save = (next: readonly string[]): void => {
    void actions.setDigestWindows(next);
  };
  return (
    <View className="gap-2">
      <Text className="font-sans text-[13px] text-muted">{t("settings.digestWindows.hint")}</Text>
      {digestWindows.map((time, index) => (
        // The row is its position: keyed by value, editing a time would remount the input.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
        <View className="flex-row items-center gap-2" key={index}>
          <TimeInput
            className="flex-1"
            label={t("settings.digestWindows.time", { index: index + 1 })}
            onTime={(next) => {
              save(digestWindows.with(index, next));
            }}
            value={time}
          />
          <IconButton
            icon={X}
            label={t("settings.digestWindows.remove", { time })}
            onPress={() => {
              save(digestWindows.filter((_, position) => position !== index));
            }}
            variant="plain"
          />
        </View>
      ))}
      <Button
        onPress={() => {
          save([...digestWindows, "12:00"]);
        }}
        variant="secondary"
      >
        {t("settings.digestWindows.add")}
      </Button>
    </View>
  );
};

/** The nightly window without notifications; each edge is saved as soon as it is a time. */
export const QuietHours = () => {
  const t = useT();
  const { actions } = usePace();
  const { quietHours } = useSettings();
  const edge = (side: "from" | "to") => (
    <View className="flex-1 gap-1.5">
      <Text className="font-sans text-[12px] text-muted">{t(`settings.quietHours.${side}`)}</Text>
      <TimeInput
        label={t(`settings.quietHours.${side}`)}
        onTime={(time) => {
          void actions.setQuietHours({ ...quietHours, [side]: time });
        }}
        value={quietHours[side]}
      />
    </View>
  );
  return (
    <View className="gap-2">
      <Text className="font-sans text-[13px] text-muted">{t("settings.quietHours.hint")}</Text>
      <View className="flex-row gap-3">
        {edge("from")}
        {edge("to")}
      </View>
    </View>
  );
};
