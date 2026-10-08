import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { detailsModel, type TimeButtonView } from "@pace/client";

const ChoiceRow = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <View className="gap-1.5">
    <Text className="font-sans text-[12px] text-muted">{label}</Text>
    <View aria-label={label} className="flex-row flex-wrap gap-1.5" role="radiogroup">
      {children}
    </View>
  </View>
);

/**
Before a Work or Study block starts (or on a long press of any button): what exactly, and
which task it is for. A task names the block after itself; Start begins it.
*/
export const DetailsSheet = ({
  button,
  onClose,
  onEditButton,
}: {
  readonly button: TimeButtonView;
  readonly onClose: () => void;
  readonly onEditButton: () => void;
}) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const run = useRunAction();
  const ctx = hooks.useClock();
  const state = useAppState((current) => current);
  const details = useMemo(() => detailsModel(state, button, ctx), [button, ctx, state]);
  const [label, setLabel] = useState(button.label);
  const [taskId, setTaskId] = useState<null | string>(button.taskId);
  const start = async (): Promise<void> => {
    if (await run(actions.tapButton(button.id, { label, taskId }))) {
      onClose();
    }
  };
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={button.label} visible>
      <TextField label={t("time.details.what")} onChangeText={setLabel} value={label} />
      {details.tasks.length === 0 ? null : (
        <ChoiceRow label={t("time.details.task")}>
          {details.tasks.map((task) => (
            <Chip
              key={task.id}
              onPress={() => {
                const isPicked = taskId === task.id;
                setTaskId(isPicked ? null : task.id);
                setLabel(isPicked ? button.label : task.title);
              }}
              selected={taskId === task.id}
            >
              {task.title}
            </Chip>
          ))}
        </ChoiceRow>
      )}
      {details.labels.length === 0 ? null : (
        <ChoiceRow label={t("time.details.recent")}>
          {details.labels.map((recent) => (
            <Chip
              key={recent}
              onPress={() => {
                setLabel(recent);
              }}
              selected={label === recent}
            >
              {recent}
            </Chip>
          ))}
        </ChoiceRow>
      )}
      <Button onPress={() => void start()}>{t("time.start")}</Button>
      <Button onPress={onEditButton} variant="ghost">
        {t("time.details.editButton")}
      </Button>
    </Sheet>
  );
};
