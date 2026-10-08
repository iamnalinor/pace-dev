import { useRouter } from "expo-router";
import { ChevronDown, Ellipsis } from "lucide-react-native";
import { Pressable } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { BackHeader } from "#app/ui/back-header.tsx";
import { ColorTag } from "#app/ui/color.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

/** Back, the project (tap to move the task), and the "more" menu. */
export const TaskHeader = ({
  onMenu,
  onProject,
  project,
}: {
  readonly onMenu?: () => void;
  /** Opens the project picker: the chip is how a task changes project. */
  readonly onProject?: () => void;
  readonly project: TaskViewModel["project"];
}) => {
  const t = useT();
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <BackHeader
      backLabel={t("common.back")}
      onBack={() => {
        router.back();
      }}
      right={
        onMenu === undefined ? null : (
          <IconButton icon={Ellipsis} label={t("task.more")} onPress={onMenu} variant="plain" />
        )
      }
    >
      <Pressable
        accessibilityLabel={t("task.changeProject", {
          project: project?.name ?? t("task.noProject"),
        })}
        accessibilityRole="button"
        className="h-11 flex-row items-center gap-1 active:opacity-70"
        disabled={onProject === undefined}
        onPress={onProject}
      >
        <ColorTag color={project?.color ?? null}>{project?.name ?? t("task.noProject")}</ColorTag>
        {onProject === undefined ? null : <ChevronDown color={palette.muted} size={14} />}
      </Pressable>
    </BackHeader>
  );
};
