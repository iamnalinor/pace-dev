import { Text, View } from "react-native";

import type { QuickTime } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";
import { zoneName } from "@pace/core";

import type { CloseForm } from "./use-close-form.ts";

/**
The exact date and time, typed on the device's wall clock. The time is the app's one time field
(«930», «9.30» read as 09:30, its own message, Enter presses Done; QA round 27 R27-01); a date
that cannot be read is said under the date. The time only ever holds a time, so an instant that
is missing means the date.
*/
const TypedTime = ({ deviceTz, form }: { readonly deviceTz: string; readonly form: CloseForm }) => {
  const t = useT();
  const { language, now } = useViewer();
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <View className="flex-3">
          <TextField
            error={form.at === null ? t("close.dateInvalid") : undefined}
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
          <TimeInput
            className="w-full"
            isDraft
            isLabelShown
            label={t("close.time")}
            onTime={(time) => {
              form.setTyped({ ...form.typed, time });
            }}
            value={form.typed.time}
          />
        </View>
      </View>
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("edit.inZone", { zone: zoneName(deviceTz, language, now) })}
      </Text>
      {form.problem === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          className="font-sans text-caption font-normal text-danger"
        >
          {t(`actionError.${form.problem}`)}
        </Text>
      )}
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
            icon: "calendar-days",
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
