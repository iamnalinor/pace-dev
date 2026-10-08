import { useState } from "react";

import type { TaskViewModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#web/shared/ui/sheet.tsx";

import { DeletePanel, MovePanel, type PanelProps, PresetPanel, ROW } from "./task-menu-panels.tsx";

type Panel = "delete" | "menu" | "move" | "preset";

type MenuProps = PanelProps & {
  readonly onPanel: (panel: Panel) => void;
  readonly onEdit: () => void;
};

/** The menu rows that apply to this task now. */
const useMenuItems = ({ close, onEdit, onPanel, view }: MenuProps) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const isOpen = view.closed === null;
  const status = view.tags.find((tag) => tag.kind === "status");
  const isPaused = status?.kind === "status" && status.status === "paused";
  const act = (pending: Parameters<typeof run>[0], undo: string): void => {
    void (async () => {
      await run(pending, { undo });
      close();
    })();
  };
  return [
    { key: "edit", label: t("task.edit"), onSelect: onEdit },
    {
      key: "preset",
      label: t("task.menu.preset"),
      onSelect: () => {
        onPanel("preset");
      },
    },
    {
      key: "move",
      label: t("task.move"),
      onSelect: () => {
        onPanel("move");
      },
    },
    ...(isOpen && !isPaused
      ? [
          {
            key: "pause",
            label: t("task.pause"),
            onSelect: () => {
              act(
                actions.setStatus(view.id, "paused"),
                t("task.statusSet", { status: t("status.paused"), title: view.title }),
              );
            },
          },
        ]
      : []),
    ...(isOpen
      ? []
      : [
          {
            key: "reopen",
            label: t("task.reopen"),
            onSelect: () => {
              act(actions.reopen(view.id), t("task.reopened"));
            },
          },
        ]),
    {
      isWarn: true,
      key: "delete",
      label: t("task.delete"),
      onSelect: () => {
        onPanel("delete");
      },
    },
  ];
};

const MenuPanel = ({ close, onEdit, onPanel, view }: MenuProps) => {
  const t = useT();
  const items = useMenuItems({ close, onEdit, onPanel, view });
  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("task.menuTitle")}</SheetTitle>
      </SheetHeader>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <button
              className={cn(ROW, "isWarn" in item && "text-warn")}
              onClick={item.onSelect}
              type="button"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
};

type Props = {
  readonly view: TaskViewModel;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Leaves the menu for the override sheet. */
  readonly onEdit: () => void;
  /** Opens straight on the project picker (the header's project chip). */
  readonly isMoveOnly?: boolean;
};

/** The "more" menu: edit, preset, project, pause or reopen, delete. */
export const TaskMenu = ({ isMoveOnly = false, isOpen, onEdit, onOpenChange, view }: Props) => {
  const [chosenPanel, setChosenPanel] = useState<Panel>("menu");
  const panel = isMoveOnly ? "move" : chosenPanel;
  const close = (): void => {
    setChosenPanel("menu");
    onOpenChange(false);
  };
  const panelProps = { close, view };
  return (
    <Sheet
      onOpenChange={(next) => {
        setChosenPanel("menu");
        onOpenChange(next);
      }}
      open={isOpen}
    >
      {/* Only the delete confirmation carries a description. */}
      <SheetContent {...(panel !== "delete" && { "aria-describedby": undefined })}>
        {panel === "menu" && <MenuPanel {...panelProps} onEdit={onEdit} onPanel={setChosenPanel} />}
        {panel === "preset" && <PresetPanel {...panelProps} />}
        {panel === "move" && <MovePanel {...panelProps} />}
        {panel === "delete" && <DeletePanel {...panelProps} />}
      </SheetContent>
    </Sheet>
  );
};
