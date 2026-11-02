import { useEffect, useMemo, useRef } from "react";
import { Text, type TextInput, View } from "react-native";

import { useAppState, useT } from "#app/app-state.tsx";
import { focusField } from "#app/platform/focus-field.ts";
import { Chip } from "#app/ui/chip.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";
import { recentReasons } from "@pace/client";

import type { CloseForm, GiveUp } from "./use-close-form.ts";

export const OUTCOMES: readonly GiveUp[] = ["cancelled", "skipped"];

/**
An optional reason for Cancelled or Skipped, and the reasons used before (one tap fills them).
With a keyboard the cursor goes to the reason as it appears: the chip that turned the sheet to
this outcome stays, and what is typed next goes here, never to the page (QA round 20 M2); a touch
screen gets no on-screen keyboard it did not ask for (bug class 71).
*/
export const GiveUpFields = ({ form }: { readonly form: CloseForm }) => {
  const t = useT();
  const reasonRef = useRef<TextInput>(null);
  useEffect(() => {
    if (KEYBOARD !== null) {
      focusField(reasonRef.current);
    }
  }, []);
  // Select the stable task map; a fresh array from the selector would re-render forever.
  const tasks = useAppState((state) => state.tasks);
  const reasons = useMemo(() => recentReasons(tasks.byId), [tasks]);
  return (
    <View className="gap-3">
      <TextField
        label={t("close.reason")}
        onChangeText={form.setReason}
        placeholder={t("close.reasonPlaceholder")}
        ref={reasonRef}
        value={form.reason}
      />
      {reasons.length === 0 ? null : (
        <View className="gap-2">
          <Text className="font-sans text-[12px] text-muted">{t("close.recentReasons")}</Text>
          <View className="flex-row flex-wrap gap-1.5">
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
