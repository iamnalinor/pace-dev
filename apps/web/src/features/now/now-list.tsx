import {
  type Announcements,
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useMemo } from "react";

import type { NowRow } from "@pace/client";

import { type Translate, useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { TaskRow } from "#web/shared/task/task-row.tsx";

import { useReorder } from "./use-reorder.ts";

type RowProps = {
  readonly row: NowRow;
  readonly isTop: boolean;
  readonly onCheck: (row: NowRow) => void;
};

/** A board row that can be dragged by its handle, or moved with Space and the arrow keys. */
const SortableTaskRow = ({ isTop, onCheck, row }: RowProps) => {
  const t = useT();
  const sortable = useSortable({ attributes: { roleDescription: t("now.dnd.role") }, id: row.id });
  return (
    <TaskRow
      className={cn(sortable.isDragging && "relative z-10 bg-raised shadow-lg")}
      isTop={isTop}
      onCheck={onCheck}
      ref={sortable.setNodeRef}
      row={row}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      trailing={
        <button
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={t("now.reorder", { title: row.title })}
          className="-my-1 -mr-2 flex w-8 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-md text-faint transition-colors outline-none hover:text-fg2 focus-visible:ring-[3px] focus-visible:ring-accent/40"
          type="button"
        >
          <GripVertical aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      }
    />
  );
};

/** Screen-reader narration of a drag, in the account language. */
const announcements = (t: Translate, rows: readonly NowRow[]): Announcements => {
  const title = (id: number | string | undefined): string =>
    rows.find((row) => row.id === id)?.title ?? "";
  return {
    onDragCancel: ({ active }) => t("now.dnd.cancelled", { title: title(active.id) }),
    onDragEnd: ({ active, over }) =>
      t("now.dnd.dropped", { over: title(over?.id), title: title(active.id) }),
    onDragOver: ({ active, over }) =>
      t("now.dnd.over", { over: title(over?.id), title: title(active.id) }),
    onDragStart: ({ active }) => t("now.dnd.picked", { title: title(active.id) }),
  };
};

type Props = {
  readonly rows: readonly NowRow[];
  readonly onCheck: (row: NowRow) => void;
};

/** The board in score order; a task can be dragged within its importance to rank it by hand. */
export const NowList = ({ onCheck, rows }: Props) => {
  const t = useT();
  const reorder = useReorder(rows);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-sm text-muted">{t("now.empty")}</p>;
  }
  return (
    <DndContext
      accessibility={{
        announcements: announcements(t, rows),
        screenReaderInstructions: { draggable: t("now.dnd.instructions") },
      }}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        void reorder(String(active.id), over === null ? null : String(over.id));
      }}
      sensors={sensors}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={t("now.tasks")} className="flex flex-col px-2">
          {rows.map((row, index) => (
            <SortableTaskRow isTop={index === 0} key={row.id} onCheck={onCheck} row={row} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};
