import { CalendarDays } from "lucide-react-native";
import { Text, View } from "react-native";

import type { QuickTime } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import type { CloseForm } from "./use-close-form.ts";

/** The exact date and time, typed on the device's wall clock. */
const TypedTime = ({ deviceTz, form }: { readonly deviceTz: string; readonly form: CloseForm }) => {
  const t = useT();
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <View className="flex-3">
          <TextField
            inputMode="numeric"
            label={t("close.date")}
            onChangeText={(date) => {
              form.setTyped({ ...form.typed, date });
            }}
            placeholder="2026-10-07"
            value={form.typed.date}
          />
        </View>
        <View className="flex-2">
          <TextField
            inputMode="numeric"
            label={t("close.time")}
            onChangeText={(time) => {
              form.setTyped({ ...form.typed, time });
            }}
            placeholder="14:52"
            value={form.typed.time}
          />
        </View>
      </View>
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("edit.inZone", { zone: deviceTz })}
      </Text>
      {form.at === null || form.problem !== null ? (
        <Text
          accessibilityLiveRegion="polite"
          className="font-sans text-caption font-normal text-danger"
        >
          {t(form.problem === null ? "close.timeInvalid" : `actionError.${form.problem}`)}
        </Text>
      ) : null}
    </View>
  );
};

/** The time pills, "Pick a time" for an exact date and time, and the zone they are read in. */
export const WhenPicker = ({
  deviceTz,
  form,
  label,
  quickTimes,
}: {
  readonly deviceTz: string;
  readonly form: CloseForm;
  readonly label: string;
  readonly quickTimes: readonly QuickTime[];
}) => {
  const t = useT();
  const { palette } = useTheme();
  const isCustom = form.choice === "custom";
  return (
    <View className="gap-2">
      <RadioChips
        choices={[
          ...quickTimes.map((quick) => ({
            text: t(`quickTime.${quick.key}`),
            value: quick.key,
          })),
          {
            leading: <CalendarDays color={isCustom ? palette["label.primary"] : palette["label.secondary"]} size={16} />,
            // Said as it is shown: the chip that opens the date and time (QA round 20 L5).
            text: t("close.pickExact"),
            value: "custom",
          },
        ]}
        label={label}
        onChange={form.choose}
        tall
        value={form.choice}
      />
      {isCustom ? <TypedTime deviceTz={deviceTz} form={form} /> : null}
    </View>
  );
};
