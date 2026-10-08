import { useState } from "react";
import { View } from "react-native";

import type { ComposerEdits, ComposerModel } from "@pace/client";

import { DueChip, DuePanel } from "./due-field.tsx";
import { EstimateChip, EstimateOptions } from "./estimate-field.tsx";

type Panel = "due" | "estimate" | null;

/** The due and the estimate as chips; a chip opens its panel (calendar and time, or a list). */
export const ComposerFields = ({
  model,
  onEdit,
}: {
  readonly model: ComposerModel;
  readonly onEdit: (edits: ComposerEdits) => void;
}) => {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (next: Exclude<Panel, null>): void => {
    setPanel(panel === next ? null : next);
  };
  return (
    <>
      <View className="flex-row flex-wrap gap-1.5 px-1">
        <DueChip
          due={model.due}
          isOpen={panel === "due"}
          onToggle={() => {
            toggle("due");
          }}
        />
        <EstimateChip
          isOpen={panel === "estimate"}
          minutes={model.estimateMinutes}
          onToggle={() => {
            toggle("estimate");
          }}
        />
      </View>
      {panel === "due" ? (
        <DuePanel
          due={model.due}
          onClose={() => {
            setPanel(null);
          }}
          onDue={(due) => {
            onEdit({ due });
          }}
        />
      ) : null}
      {panel === "estimate" ? (
        <EstimateOptions
          minutes={model.estimateMinutes}
          onEstimate={(estimateMinutes) => {
            onEdit({ estimateMinutes });
            setPanel(null);
          }}
        />
      ) : null}
    </>
  );
};
