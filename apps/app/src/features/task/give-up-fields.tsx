import { useMemo } from "react";
import { Text, View } from "react-native";

import { useAppState, useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { recentReasons } from "@pace/client";

import type { CloseForm, GiveUp } from "./use-close-form.ts";

const OUTCOMES: readonly GiveUp[] = ["cancelled", "skipped"];

/** Cancelled or Skipped, an optional reason, and the reasons used before (one tap fills them). */
export const GiveUpFields = ({ form }: { readonly form: CloseForm }) => {
  const t = useT();
  // Select the stable task map; a fresh array from the selector would re-render forever.
  const tasks = useAppState((state) => state.tasks);
  const reasons = useMemo(() => recentReasons(tasks.byId), [tasks]);
  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        {OUTCOMES.map((outcome) => (
          <Chip
            key={outcome}
            onPress={() => {
              form.setOutcome(outcome);
            }}
            selected={form.outcome === outcome}
            tall
          >
            {t(`close.${outcome}`)}
          </Chip>
        ))}
      </View>
      <TextField
        label={t("close.reason")}
        onChangeText={form.setReason}
        placeholder={t("close.reasonPlaceholder")}
        value={form.reason}
      />
      {reasons.length === 0 ? null : (
        <View className="gap-2">
          <Text className="font-sans text-caption font-normal text-label-tertiary">
            {t("close.recentReasons")}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {reasons.map((reason) => (
              <Chip
                key={reason}
                onPress={() => {
                  form.setReason(reason);
                }}
                selected={form.reason === reason}
              >
                {reason}
              </Chip>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};
