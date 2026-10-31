import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

/** A start this soon after the bar was used came from it: the bar stays as the finger left it. */
const BAR_USE_MS = 5000;

/**
Whether the field and the buttons show: always on a wide window or with nothing running.
On a phone they fold when something starts that the bar did not start (Now opened on it, the
store loaded it late, the bot or another device started it), until a tap unfolds them or that
activity stops. A start made in the open bar never folds it under the finger.
*/
export const useFold = (
  runningId: null | string,
  {
    isPicking,
    lastUseRef,
  }: { readonly isPicking: boolean; readonly lastUseRef: { readonly current: number } },
) => {
  const isWide = useIsWide();
  const [foldedFor, setFoldedFor] = useState(runningId);
  useEffect(() => {
    if (runningId !== null && !isPicking && Date.now() - lastUseRef.current > BAR_USE_MS) {
      setFoldedFor(runningId);
    }
  }, [isPicking, lastUseRef, runningId]);
  const isFoldable = !isWide && runningId !== null;
  const isUnfolded = foldedFor === null || foldedFor !== runningId;
  return {
    isFoldable,
    isShown: !isFoldable || isUnfolded,
    isUnfolded,
    toggle: (): void => {
      setFoldedFor(isUnfolded ? runningId : null);
    },
  };
};

export const HIDDEN = { display: "none" } as const;

/** The one line a phone's bar folds the field and the buttons into while something runs. */
export const FoldToggle = ({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const Chevron = isOpen ? ChevronDown : ChevronUp;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-lg border border-line px-3 active:opacity-70"
      onPress={onToggle}
    >
      <Text className="font-sans text-[13px] text-fg2">{t("time.startOther")}</Text>
      <Chevron color={palette.fg2} size={16} />
    </Pressable>
  );
};
