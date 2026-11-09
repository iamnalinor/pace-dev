import { View } from "react-native";

import type { SubtaskRow, TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { Group } from "#app/ui/group.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { spacePress } from "#app/ui/space-press.ts";
import { Text } from "#app/ui/text.tsx";

const weekday = (atIso: string, tz: string, language: string): string =>
  new Intl.DateTimeFormat(language, { timeZone: tz, weekday: "short" }).format(new Date(atIso));

/** The 24 circle in its 48 column, filled once done. */
const Mark = ({ state }: { readonly state: SubtaskRow["state"] }) => (
  <View className="min-h-hit min-w-hit items-center justify-center">
    <View
      className={cx(
        "size-6 items-center justify-center rounded-pill border-stroke",
        state === "pending" ? "border-outline" : "border-label-secondary bg-label-secondary",
      )}
    >
      {state === "pending" ? null : <Icon name="check" size="inline" tone="inverse" />}
    </View>
  </View>
);

const SubtaskItem = ({
  isClosed,
  subtask,
  taskId,
}: {
  /** A closed task's marks are read-only, both ways (session review #3): reopen it first. */
  readonly isClosed: boolean;
  readonly subtask: SubtaskRow;
  readonly taskId: string;
}) => {
  const t = useT();
  const { deviceTz, language } = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  // When it was done, on this device's clock: the one mark records its instant (feedback 5).
  const note =
    subtask.doneAt === null
      ? ""
      : t("task.subtaskDoneAt", {
          when: `${weekday(subtask.doneAt, deviceTz, language)} ${clockTime(subtask.doneAt, deviceTz)}`,
        });
  const toggle = (): void => {
    if (isClosed) {
      return;
    }
    void run(
      subtask.state === "pending"
        ? actions.markDone(taskId, subtask.id)
        : actions.unmarkDone(taskId, subtask.id),
    );
  };
  // A bare number label ("290") is the number itself: shown once, in the label.
  const hasNumber = subtask.number !== null && String(subtask.number) !== subtask.label;
  return (
    <Pressable
      checked={subtask.state !== "pending"}
      className="flex-row items-start gap-1 pl-2 pr-row-x"
      disabled={isClosed}
      label={subtask.label}
      onPress={toggle}
      role="checkbox"
      {...spacePress(toggle, isClosed)}
    >
      <Mark state={subtask.state} />
      <View className="min-w-0 flex-1 flex-row items-start gap-2 py-3">
        {hasNumber ? (
          <Text numeric role="footnote" tone="secondary">
            {`№${String(subtask.number)}`}
          </Text>
        ) : null}
        <Text className="flex-1" role="body" tone="primary">
          {subtask.label}
        </Text>
      </View>
      <View className="min-h-hit justify-center">
        <Text role="footnote" tone="secondary">
          {note}
        </Text>
      </View>
    </Pressable>
  );
};

/**
The subtasks with their done marks; a tap marks one done (now) or takes that back. On a closed
task the list is read-only: ticking is refused there, and taking a mark back could reopen it.
*/
export const SubtaskChecklist = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  if (view.subtasks.length === 0) {
    return null;
  }
  const done = view.subtasks.filter((subtask) => subtask.state === "done").length;
  return (
    <View>
      <SectionHeader
        action={
          <Text numeric role="subhead" tone="secondary">
            {t("task.subtasksSummary", { done, total: view.subtasks.length })}
          </Text>
        }
        title={t("task.subtasks")}
      />
      <Group separatorInset="check">
        {view.subtasks.map((subtask) => (
          <SubtaskItem
            isClosed={view.closed !== null}
            key={subtask.id}
            subtask={subtask}
            taskId={view.id}
          />
        ))}
      </Group>
    </View>
  );
};
