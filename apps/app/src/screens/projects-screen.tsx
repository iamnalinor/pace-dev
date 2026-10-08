import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { inkClass, washClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";

/** Every active project with its open count; a tap opens its page. */
export const ProjectsScreen = () => {
  const t = useT();
  const router = useRouter();
  const { hooks } = usePace();
  const projects = hooks.useAppState((state) => state.projects);
  const now = hooks.useNow();
  const active = Object.values(projects.byId)
    .filter((project) => !project.archived)
    .toSorted((a, b) => a.name.localeCompare(b.name));
  const openCount = (projectId: string): number =>
    now.projects.find((chip) => chip.id === projectId)?.open ?? 0;
  return (
    <Screen header={<ScreenHeader title={t("nav.projects")} />}>
      {active.length === 0 ? <EmptyState>{t("projects.empty")}</EmptyState> : null}
      <View className="px-4">
        {active.map((project) => (
          <Pressable
            accessibilityLabel={project.name}
            accessibilityRole="link"
            className={cx(
              "mb-2 min-h-14 flex-row items-center gap-3 rounded-xl border px-4 active:opacity-70",
              washClass(project.color),
            )}
            key={project.id}
            onPress={() => {
              router.push(`/project/${project.id}`);
            }}
          >
            <Text
              className={cx("flex-1 font-sans text-[15px] font-medium", inkClass(project.color))}
            >
              {project.name}
            </Text>
            <Text className="font-mono text-[13px] text-fg2">{openCount(project.id)}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
};
