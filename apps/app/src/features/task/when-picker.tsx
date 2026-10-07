import { CalendarDays } from "lucide-react-native";
import { Text, View } from "react-native";

import type { QuickTime } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import type { CloseForm } from "./use-close-form.ts";

/** The exact date and time, typed on the device's wall clock. */
const TypedTime = ({ deviceTz, form }: { readonly deviceTz: string; readonly form: CloseForm }) => {
  const t = useT();
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <View className="flex-[3]">
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
        <View className="flex-[2]">
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
      <Text className="font-sans text-[12px] text-muted">
        {t("edit.inZone", { zone: deviceTz })}
      </Text>
      {form.at === null ? (
        <Text accessibilityLiveRegion="polite" className="font-sans text-[12px] text-warn">
          {t("close.timeInvalid")}
        </Text>
      ) : null}
    </View>
  );
};

/** The time pills, a calendar pill for an exact date and time, and the zone they are read in. */
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
      <Text className="font-sans text-[12px] text-muted">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {quickTimes.map((quick) => (
          <Chip
            key={quick.key}
            onPress={() => {
              form.choose(quick.key);
            }}
            selected={form.choice === quick.key}
            tall
          >
            {t(`quickTime.${quick.key}`)}
          </Chip>
        ))}
        <Chip
          label={t("close.pickExact")}
          leading={<CalendarDays color={isCustom ? palette.inverseFg : palette.fg2} size={16} />}
          onPress={() => {
            form.choose("custom");
          }}
          selected={isCustom}
          tall
        >
          {isCustom ? t("close.date") : ""}
        </Chip>
      </View>
      {isCustom ? <TypedTime deviceTz={deviceTz} form={form} /> : null}
    </View>
  );
};
