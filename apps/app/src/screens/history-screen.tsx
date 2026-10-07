import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import type { HistoryEntry } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { TaskRow } from "#app/shared/task-row.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { addMinutesIso, type MessageKey } from "@pace/core";

import { PushedScreen } from "./pushed-screen.tsx";

const MINUTES_PER_DAY = 1440;

const EntryRow = ({ entry }: { readonly entry: HistoryEntry }) => {
  const t = useT();
  const viewer = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <View className="flex-row items-center gap-3 border-t border-line py-2.5">
      <View className="flex-1 gap-0.5">
        <Text className="font-sans text-[14px] text-fg">
          {t(`event.${entry.type}` as MessageKey)}
          {entry.taskTitle === null ? "" : ` · ${entry.taskTitle}`}
        </Text>
        <Text className="font-sans text-[12px] text-muted">
          {[
            zonedText({ at: entry.occurredAt, mode: "datetime", tz: viewer.deviceTz }, viewer),
            t(`source.${entry.source}`),
          ].join(" · ")}
        </Text>
      </View>
      {entry.revocable ? (
        <Button
          onPress={() => {
            void run(actions.revoke(entry.id), { success: t("history.revoked") });
          }}
          variant="ghost"
        >
          {t("common.undo")}
        </Button>
      ) : null}
    </View>
  );
};

/** The board as it was on a chosen day, and every change, each one undoable. */
export const HistoryScreen = () => {
  const t = useT();
  const router = useRouter();
  const { hooks } = usePace();
  const { now } = hooks.useClock();
  const [at, setAt] = useState<null | string>(null);
  const instant = at ?? now;
  const history = hooks.useHistory(instant);
  return (
    <PushedScreen title={t("history.title")}>
      <View className="flex-row gap-2 px-4 pb-3">
        <Button
          onPress={() => {
            setAt(addMinutesIso(instant, -MINUTES_PER_DAY));
          }}
          variant="secondary"
        >
          {t("history.dayBack")}
        </Button>
        <Button
          onPress={() => {
            setAt(addMinutesIso(instant, MINUTES_PER_DAY));
          }}
          variant="secondary"
        >
          {t("history.dayForward")}
        </Button>
        <Button
          onPress={() => {
            setAt(null);
          }}
          variant="ghost"
        >
          {t("history.now")}
        </Button>
      </View>
      <Text className="px-5 pb-1 font-sans text-[12px] font-medium text-muted">
        {t("history.boardAt")}
      </Text>
      <View className="px-2">
        {history.board.rows.map((row) => (
          <TaskRow
            key={row.id}
            onOpen={() => {
              router.push(`/task/${row.id}`);
            }}
            row={row}
          />
        ))}
      </View>
      <View className="px-5 pt-4">
        <Text className="pb-1 font-sans text-[12px] font-medium text-muted">
          {t("history.events")}
        </Text>
        {history.events.map((entry) => (
          <EntryRow entry={entry} key={entry.id} />
        ))}
      </View>
    </PushedScreen>
  );
};
