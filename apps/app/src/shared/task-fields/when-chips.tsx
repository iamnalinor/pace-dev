import { View } from "react-native";

import type { TaskFormValues } from "./task-fields.tsx";

import { DateChip } from "./date-field.tsx";
import { EstimateChip } from "./estimate-field.tsx";

type Panel = "due" | "estimate" | "start" | null;

/** The three compact controls above the active date or estimate panel. */
export const WhenChips = ({
  fallback,
  panel,
  toggle,
  values,
}: {
  readonly fallback: null | number;
  readonly panel: Panel;
  readonly toggle: (panel: Exclude<Panel, null>) => void;
  readonly values: TaskFormValues;
}) => (
  <View className="flex-row flex-wrap gap-1.5">
    <DateChip
      isOpen={panel === "start"}
      kind="start"
      onToggle={() => {
        toggle("start");
      }}
      value={values.start}
    />
    <DateChip
      isOpen={panel === "due"}
      kind="due"
      onToggle={() => {
        toggle("due");
      }}
      value={values.due}
    />
    <EstimateChip
      fallback={fallback}
      isOpen={panel === "estimate"}
      minutes={values.estimateMinutes}
      onToggle={() => {
        toggle("estimate");
      }}
    />
  </View>
);
