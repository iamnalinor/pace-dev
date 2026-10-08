import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { ProjectForm } from "#app/features/projects/project-form.tsx";
import { inkClass, washClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

/** "+ New project": a name and a color, created on the spot. */
const NewProject = () => {
  const t = useT();
  const { actions } = usePace();
  const { palette } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  if (!isOpen) {
    return (
      <Pressable
        accessibilityRole="button"
        className="mb-3 h-11 flex-row items-center justify-center gap-2 rounded-lg border border-line active:opacity-70"
        onPress={() => {
          setIsOpen(true);
        }}
      >
        <Plus color={palette.fg} size={16} />
        <Text className="font-sans text-[14px] text-fg">{t("projects.new")}</Text>
      </Pressable>
    );
  }
  return (
    <View className="mb-3">
      <ProjectForm
        initial={{ color: "blue", name: "" }}
        onCancel={() => {
          setIsOpen(false);
        }}
        onSave={async (values) => {
          const result = await actions.createProject(values);
          if (result.ok) {
            setIsOpen(false);
          }
          return result;
        }}
        submitLabel={t("projects.create")}
      />
    </View>
  );
};

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
      <View className="px-4">
        <NewProject />
        {active.length === 0 ? <EmptyState>{t("projects.empty")}</EmptyState> : null}
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
