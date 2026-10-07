import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { TaskRow } from "#app/shared/task-row.tsx";
import { useCheckTask } from "#app/shared/use-check-task.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";

import { PushedScreen } from "./pushed-screen.tsx";

const Figure = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <View accessibilityLabel={`${label}: ${value}`} accessible className="flex-1 gap-0.5">
    <Text className="font-sans text-[11px] text-muted">{label}</Text>
    <Text className="font-mono text-[18px] text-fg">{value}</Text>
  </View>
);

/** A project: its figures, the open tasks like Now, and what was done. */
export const ProjectScreen = ({ id }: { readonly id: string }) => {
  const t = useT();
  const router = useRouter();
  const check = useCheckTask();
  const view = usePace().hooks.useProjectView(id);
  if (!view.ok) {
    return (
      <PushedScreen title={t("nav.projects")}>
        <EmptyState>{t("project.notFound")}</EmptyState>
      </PushedScreen>
    );
  }
  const project = view.value;
  const { stats } = project;
  return (
    <PushedScreen title={project.name}>
      <View className="mx-4 mb-4 flex-row gap-2 rounded-xl border border-line bg-surface p-3.5">
        <Figure label={t("project.stat.open")} value={String(stats.open)} />
        <Figure
          label={t("project.stat.onTime")}
          value={`${String(stats.onTime.done)}/${String(stats.onTime.total)}`}
        />
        <Figure label={t("project.stat.late")} value={String(stats.late)} />
      </View>
      {project.open.length === 0 ? <EmptyState>{t("project.empty")}</EmptyState> : null}
      <View className="px-2">
        {project.open.map((row) => (
          <TaskRow
            key={row.id}
            onCheck={() => {
              check(row);
            }}
            onOpen={() => {
              router.push(`/task/${row.id}`);
            }}
            row={row}
            withDot={false}
          />
        ))}
      </View>
      {project.done.length === 0 ? null : (
        <View className="px-5 pt-4">
          <Text className="pb-1 font-sans text-[12px] font-medium text-muted">
            {t("project.done")}
          </Text>
          {project.done.map((row) => (
            <Text
              className="border-t border-line py-2.5 font-sans text-[14px] text-fg2"
              key={row.id}
            >
              {[row.title, t(`outcome.${row.outcome}`)].join(" · ")}
            </Text>
          ))}
        </View>
      )}
    </PushedScreen>
  );
};
