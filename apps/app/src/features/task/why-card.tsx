import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { ordinal } from "#app/format/numbers.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { whyLines } from "./why-lines.ts";

/** The task's place on Now (0-based; -1 when it is not listed) names the card. */
const useTitle = (place: number): string => {
  const t = useT();
  const { language } = useViewer();
  if (place === 0) {
    return t("task.whyTop");
  }
  return place > 0 ? t("task.whyNth", { nth: ordinal(place + 1, language) }) : t("task.whyHere");
};

/** "Why it's 2nd on Now →": opens the explanation — the policy's inputs and the score. */
export const WhyCard = ({
  place,
  view,
}: {
  readonly place: number;
  readonly view: TaskViewModel;
}) => {
  const t = useT();
  const viewer = useViewer();
  const { palette } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const title = useTitle(place);
  const policyName = t(`policy.${view.why.policy}`);
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <View className="mx-4 rounded-xl border border-line bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="min-h-12 flex-row items-center justify-between px-3.5 active:opacity-70"
        onPress={() => {
          setIsOpen((open) => !open);
        }}
      >
        <Text className="font-sans text-[14px] font-medium text-fg">{title}</Text>
        <Chevron color={palette.muted} size={18} strokeWidth={1.75} />
      </Pressable>
      {isOpen ? (
        <View className="gap-1.5 border-t border-line px-3.5 pb-3.5 pt-3" testID="why-card">
          <Text className="font-sans text-[12px] text-muted">
            {`${policyName} · ${t("task.whyFormula")}: ${view.why.formula}`}
          </Text>
          {whyLines(view.why.rows, view.overrideSheet.importance, viewer).map((line) => (
            <View className="flex-row justify-between gap-3" key={line.id}>
              <Text className="flex-shrink font-sans text-[13px] text-muted">{line.label}</Text>
              <Text className="font-mono text-[13px] text-fg">{line.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};
