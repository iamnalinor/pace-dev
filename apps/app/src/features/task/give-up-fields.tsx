import { useEffect, useMemo, useRef } from "react";
import { type TextInput, View } from "react-native";

import { useAppState, useT } from "#app/app-state.tsx";
import { focusField } from "#app/platform/focus-field.ts";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";
import { recentReasons } from "@pace/client";

import type { CloseForm, GiveUp } from "./use-close-form.ts";

export const OUTCOMES: readonly GiveUp[] = ["cancelled", "skipped"];

/**
An optional reason for Cancelled or Skipped, and the reasons used before (one tap fills them).
With a keyboard the cursor goes to the reason each time Cancelled or Skipped is pressed
(`reasonAsked` counts the presses): what is typed next goes here, never to the page (QA round 20
M2). An arrow moving through the outcomes keeps the focus in the row, where the next arrow goes
on (round 7 review 9); a touch screen gets no on-screen keyboard it did not ask for (class 71).
*/
export const GiveUpFields = ({
  form,
  reasonAsked,
}: {
  readonly form: CloseForm;
  readonly reasonAsked: number;
}) => {
  const t = useT();
  const reasonRef = useRef<TextInput>(null);
  useEffect(() => {
    if (KEYBOARD !== null && reasonAsked > 0) {
      focusField(reasonRef.current);
    }
  }, [reasonAsked]);
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
        <RadioChips
          choices={reasons.map((reason) => ({ text: reason, value: reason }))}
          label={t("close.recentReasons")}
          onChange={(reason) => {
            form.setReason(reason);
          }}
          value={form.reason}
        />
      )}
    </View>
  );
};
