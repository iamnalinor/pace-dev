import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { ordinal } from "#app/format/numbers.ts";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { type TaskViewModel, type WhyText, whyText } from "@pace/client";

/** The task's place on Now (0-based; -1 when it is not listed) names the card. */
const useTitle = (place: number): string => {
  const t = useT();
  const { language } = useViewer();
  if (place === 0) {
    return t("task.whyTop");
  }
  return place > 0 ? t("task.whyNth", { nth: ordinal(place + 1, language) }) : t("task.whyHere");
};

/** The four titled blocks; the score closes the last one under a heavy rule. */
const WhyGroups = ({ groups }: { readonly groups: WhyText["groups"] }) => (
  <>
    {groups.map((group) => (
      <View className="pt-1.5" key={group.name}>
        <Text className="pb-0.5 font-mono text-[11px] uppercase tracking-[0.6px] text-faint">
          {group.title}
        </Text>
        {group.lines.map((line) => {
          // The score is the total the board sorts by: a heavy rule and bold set it apart.
          const isTotal = line.tone === "total";
          return (
            <View
              className={cx(
                "flex-row justify-between gap-3 py-1",
                isTotal ? "mt-1 border-t-2 border-fg" : "border-t border-line",
              )}
              key={line.id}
            >
              <Text
                className={cx(
                  "flex-shrink font-sans text-[13px]",
                  isTotal ? "font-semibold text-fg" : "text-muted",
                )}
              >
                {line.label}
              </Text>
              <Text
                className={cx(
                  "font-mono text-[13px]",
                  line.tone === "warn" ? "text-warn" : "text-fg",
                  isTotal && "font-semibold",
                )}
              >
                {line.value}
              </Text>
            </View>
          );
        })}
      </View>
    ))}
  </>
);

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
  const text = whyText(view.why, {
    importance: view.overrideSheet.importance,
    instant: (iso) => zonedText({ at: iso, mode: "datetime", tz: viewer.deviceTz }, viewer),
    language: viewer.language,
    rank: view.rank,
  });
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
        <View className="gap-1 border-t border-line px-3.5 pb-3.5 pt-2" testID="why-card">
          <Text className="font-sans text-[12px] text-muted">{policyName}</Text>
          <WhyGroups groups={text.groups} />
          <Text
            accessibilityLabel={`${t("task.whyFormula")}: ${text.formula.map((run) => run.text).join("")}`}
            className="mt-2 border-t border-line pt-2 font-mono text-[12px] text-muted"
          >
            {text.formula.map((run) => (
              <Text className={run.isValue ? "font-medium text-accentText" : ""} key={run.id}>
                {run.text}
              </Text>
            ))}
          </Text>
        </View>
      ) : null}
    </View>
  );
};
