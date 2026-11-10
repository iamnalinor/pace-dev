import type { ActivitySheetProps, ActivityTarget } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";

import { ActivityEditorBody, useActivityEditor } from "./activity-editor.tsx";

/** What the sheet edits: an existing block (move and rename) or a new past one. */
export type SheetTarget = ActivityTarget;

/** Log a past block, or move and rename one already on the day. */
export const ActivitySheet = (props: ActivitySheetProps) => {
  const t = useT();
  const { onClose, target } = props;
  const editor = useActivityEditor(props);
  return (
    <Sheet
      closeLabel={t("common.close")}
      // Save pinned at the sheet's edge, as the task's sheets have it: on a phone the fields,
      // the apps and Delete ran it below the fold (QA round 25 R25-10).
      footer={
        <SheetActions
          onPrimary={() => {
            void editor.save();
          }}
          primaryLabel={t("common.save")}
        />
      }
      name="activity"
      onClose={onClose}
      open
      subtitle={editor.subtitle}
      title={t(target.kind === "edit" ? "day.editTitle" : "day.logPast")}
    >
      <ActivityEditorBody {...props} editor={editor} />
    </Sheet>
  );
};
