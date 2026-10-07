import { Check } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import type { ProjectTarget, TaskViewModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ProjectDot } from "#web/shared/ui/project-dot.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#web/shared/ui/sheet.tsx";

import { deletePlan } from "./delete-plan.ts";

type Panel = "delete" | "menu" | "move" | "preset";

const ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors outline-none hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-accent/40";

const Choice = ({
  children,
  isCurrent,
  onChoose,
}: {
  readonly children: ReactNode;
  readonly isCurrent: boolean;
  readonly onChoose: () => void;
}) => (
  <li>
    <button aria-current={isCurrent} className={ROW} onClick={onChoose} type="button">
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {isCurrent && <Check aria-hidden="true" className="size-4 text-fg2" strokeWidth={2} />}
    </button>
  </li>
);

type PanelProps = {
  readonly view: TaskViewModel;
  readonly close: () => void;
};

const PresetPanel = ({ close, view }: PanelProps) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("task.presetTitle")}</SheetTitle>
      </SheetHeader>
      <ul>
        {view.overrideSheet.presets.map((preset) => (
          <Choice
            isCurrent={preset.id === view.overrideSheet.presetId}
            key={preset.id}
            onChoose={() => {
              void (async () => {
                if (preset.id !== view.overrideSheet.presetId) {
                  await run(actions.setPreset(view.id, preset.id), { undo: t("task.presetSet") });
                }
                close();
              })();
            }}
          >
            <span className="truncate">{preset.name}</span>
            {preset.builtIn && (
              <span className="text-xs text-muted">{t("task.presetBuiltIn")}</span>
            )}
          </Choice>
        ))}
      </ul>
    </>
  );
};

const MovePanel = ({ close, view }: PanelProps) => {
  const t = useT();
  const { actions, hooks } = useServices();
  const run = useRunAction();
  const { byId } = hooks.useAppState((state) => state.projects);
  const projects = useMemo(
    () => Object.values(byId).filter((project) => !project.archived),
    [byId],
  );
  const [name, setName] = useState("");
  const move = (target: null | ProjectTarget): void => {
    void (async () => {
      const events = await run(actions.setProject(view.id, target), {
        undo: t("task.moved", { title: view.title }),
      });
      if (events !== null) {
        close();
      }
    })();
  };
  const current = view.project?.id ?? null;
  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("task.moveTitle")}</SheetTitle>
      </SheetHeader>
      <ul>
        <Choice
          isCurrent={current === null}
          onChoose={() => {
            move(null);
          }}
        >
          <ProjectDot color={null} />
          {t("task.noProject")}
        </Choice>
        {projects.map((project) => (
          <Choice
            isCurrent={current === project.id}
            key={project.id}
            onChoose={() => {
              move({ projectId: project.id });
            }}
          >
            <ProjectDot color={project.color} />
            <span className="truncate">{project.name}</span>
          </Choice>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== "") {
            move({ projectName: name });
          }
        }}
      >
        <label className="flex flex-1 flex-col gap-1.5 text-xs text-muted">
          {t("task.newProject")}
          <input
            className="h-11 rounded-md border border-line bg-bg px-3 text-sm text-fg"
            onChange={(event) => {
              setName(event.target.value);
            }}
            value={name}
          />
        </label>
        <Button disabled={name.trim() === ""} type="submit" variant="outline">
          {t("task.moveSubmit")}
        </Button>
      </form>
    </>
  );
};

const DeletePanel = ({ close, view }: PanelProps) => {
  const t = useT();
  const { actions, state } = useServices();
  const run = useRunAction();
  const navigate = useNavigate();
  const remove = async (): Promise<void> => {
    const plan = deletePlan(state.store.getState().events, view.id);
    const undo = { undo: t("task.deleted", { title: view.title }) };
    const events =
      plan.kind === "revoke"
        ? await run(actions.revoke(plan.eventId), undo)
        : await run(actions.closeTask({ outcome: "cancelled", taskId: view.id }), undo);
    if (events === null) {
      return;
    }

    close();
    await navigate("/");
  };
  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("task.deleteTitle", { title: view.title })}</SheetTitle>
        <SheetDescription>{t("task.deleteBody")}</SheetDescription>
      </SheetHeader>
      <SheetFooter>
        <SheetClose asChild>
          <Button className="h-[50px] flex-1 rounded-lg" variant="secondary">
            {t("common.cancel")}
          </Button>
        </SheetClose>
        <Button
          className="h-[50px] flex-1 rounded-lg border-warn text-warn"
          onClick={() => {
            void remove();
          }}
          variant="outline"
        >
          {t("common.delete")}
        </Button>
      </SheetFooter>
    </>
  );
};

type MenuProps = PanelProps & {
  readonly onPanel: (panel: Panel) => void;
  readonly onEdit: () => void;
};

const MenuPanel = ({ close, onEdit, onPanel, view }: MenuProps) => {
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
  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("task.menuTitle")}</SheetTitle>
      </SheetHeader>
      <ul>
        <li>
          <button className={ROW} onClick={onEdit} type="button">
            {t("task.edit")}
          </button>
        </li>
        <li>
          <button
            className={ROW}
            onClick={() => {
              onPanel("preset");
            }}
            type="button"
          >
            {t("task.menu.preset")}
          </button>
        </li>
        <li>
          <button
            className={ROW}
            onClick={() => {
              onPanel("move");
            }}
            type="button"
          >
            {t("task.move")}
          </button>
        </li>
        {isOpen && !isPaused && (
          <li>
            <button
              className={ROW}
              onClick={() => {
                act(
                  actions.setStatus(view.id, "paused"),
                  t("task.statusSet", { status: t("status.paused"), title: view.title }),
                );
              }}
              type="button"
            >
              {t("task.pause")}
            </button>
          </li>
        )}
        {!isOpen && (
          <li>
            <button
              className={ROW}
              onClick={() => {
                act(actions.reopen(view.id), t("task.reopened"));
              }}
              type="button"
            >
              {t("task.reopen")}
            </button>
          </li>
        )}
        <li>
          <button
            className={cn(ROW, "text-warn")}
            onClick={() => {
              onPanel("delete");
            }}
            type="button"
          >
            {t("task.delete")}
          </button>
        </li>
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
};

/** The "more" menu: edit, preset, project, pause or reopen, delete. */
export const TaskMenu = ({ isOpen, onEdit, onOpenChange, view }: Props) => {
  const [panel, setPanel] = useState<Panel>("menu");
  const close = (): void => {
    setPanel("menu");
    onOpenChange(false);
  };
  const panelProps = { close, view };
  return (
    <Sheet
      onOpenChange={(next) => {
        setPanel("menu");
        onOpenChange(next);
      }}
      open={isOpen}
    >
      {/* Only the delete confirmation carries a description. */}
      <SheetContent {...(panel !== "delete" && { "aria-describedby": undefined })}>
        {panel === "menu" && <MenuPanel {...panelProps} onEdit={onEdit} onPanel={setPanel} />}
        {panel === "preset" && <PresetPanel {...panelProps} />}
        {panel === "move" && <MovePanel {...panelProps} />}
        {panel === "delete" && <DeletePanel {...panelProps} />}
      </SheetContent>
    </Sheet>
  );
};
