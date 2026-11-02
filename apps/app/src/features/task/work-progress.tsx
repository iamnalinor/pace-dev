import { useState } from "react";
import { Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Slider } from "#app/ui/slider.tsx";

const MAX = 10;

export type LiveProgress = {
  /** The step on screen: under the finger, then the one being saved, then the stored one. */
  readonly step: number;
  readonly slide: (step: null | number) => void;
  readonly commit: (step: number) => void;
};

/**
The slider's step as the screen shows it. A released step stays on screen while it is saved,
so the thumb never jumps back to the stored value for a moment; a refusal puts it back.
*/
export const useLiveProgress = (view: TaskViewModel): LiveProgress => {
  const { actions } = usePace();
  const run = useRunAction();
  const [sliding, setSliding] = useState<null | number>(null);
  const [saving, setSaving] = useState<null | number>(null);
  const stored = view.progress.slider ?? 0;
  return {
    commit: (step) => {
      setSliding(null);
      if (step === stored) {
        return;
      }
      setSaving(step);
      void (async () => {
        await run(actions.setProgress(view.id, step));
        // A later release already on its way keeps its own value on screen.
        setSaving((current) => (current === step ? null : current));
      })();
    },
    slide: setSliding,
    step: sliding ?? saving ?? stored,
  };
};

/** A task's progress without subtasks, in percent: a slider to drag, like a volume control. */
export const WorkProgress = ({
  live,
  view,
}: {
  readonly live: LiveProgress;
  readonly view: TaskViewModel;
}) => {
  const t = useT();
  // A closed task's progress is its outcome, shown in the tags.
  if (view.progress.mode !== "slider" || view.closed !== null) {
    return null;
  }
  return (
    <View className="mx-4 gap-1 rounded-xl border border-separator bg-cell px-4 pb-2 pt-4">
      <View className="flex-row justify-between">
        <Text className="font-sans text-subhead font-normal text-label-primary">
          {t("task.progress")}
        </Text>
        <Text className="font-sans text-footnote tabular-nums text-label-primary">
          {t("task.progressOf", { value: (live.step * 100) / MAX })}
        </Text>
      </View>
      <Slider
        label={t("task.progressAria")}
        max={MAX}
        onChange={live.commit}
        onSlide={live.slide}
        value={live.step}
      />
    </View>
  );
};
