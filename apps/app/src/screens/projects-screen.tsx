import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { ColorBar } from "#app/ui/color.tsx";
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
            className="min-h-14 flex-row items-center gap-3 border-b border-line px-1 active:opacity-70"
            key={project.id}
            onPress={() => {
              router.push(`/project/${project.id}`);
            }}
          >
            <ColorBar color={project.color} />
            <Text className="flex-1 font-sans text-[15px] text-fg">{project.name}</Text>
            <Text className="font-mono text-[13px] text-muted">{openCount(project.id)}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
};
