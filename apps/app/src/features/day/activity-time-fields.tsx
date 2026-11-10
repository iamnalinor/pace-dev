import { useRef } from "react";
import { type TextInput, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { TIME_MAX_LENGTH } from "#app/ui/time-input.tsx";
import { type ActivityForm, type FormPartProps, typeTime } from "@pace/client";

import type { Faults } from "./activity-draft.ts";

/** A time field of the sheet. */
export type TimeSide = "from" | "to";

export type ActivityFieldsProps = FormPartProps<ActivityForm> & {
  readonly faults: Faults | null;
  /** A time field was left: it reads its text whole and says what is wrong with it (R27-04). */
  readonly onLeave: (side: TimeSide) => void;
  readonly isEndEditable: boolean;
  /** What a new block takes from the blocks it lands on, said under the start (R27-05). */
  readonly yieldHint: null | string;
};

/** From and To, typed as times: From moves on to To once its last minute digit is typed. */
export const ActivityTimeFields = ({
  draft,
  faults,
  isEndEditable,
  onLeave,
  patch,
  yieldHint,
}: ActivityFieldsProps) => {
  const t = useT();
  const toFieldRef = useRef<TextInput>(null);
  const said = (key: MessageKey | null | undefined): null | string =>
    key === null || key === undefined ? null : t(key);
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <TextField
          error={said(faults?.from)}
          {...(yieldHint !== null && { hint: yieldHint })}
          keyboardType="number-pad"
          label={t("day.from")}
          maxLength={TIME_MAX_LENGTH}
          onBlur={() => {
            onLeave("from");
          }}
          onChangeText={(from) => {
            const typed = typeTime(from, draft.from);
            patch({ from: typed.text });
            // On to the end only when the last minute digit was just typed at the end: a time
            // finished in the middle of an edit keeps the caret where the person is working.
            if (typed.isComplete && typed.text.startsWith(draft.from) && draft.from.length === 4) {
              toFieldRef.current?.focus();
            }
          }}
          placeholder="09:00"
          value={draft.from}
        />
      </View>
      {isEndEditable ? (
        <View className="flex-1">
          <TextField
            error={said(faults?.to)}
            keyboardType="number-pad"
            label={t("day.to")}
            maxLength={TIME_MAX_LENGTH}
            onBlur={() => {
              onLeave("to");
            }}
            onChangeText={(to) => {
              patch({ to: typeTime(to, draft.to).text });
            }}
            placeholder="10:30"
            ref={toFieldRef}
            value={draft.to}
          />
        </View>
      ) : null}
    </View>
  );
};

/** What it was, its category and its boundaries (the end only once it has one). */
