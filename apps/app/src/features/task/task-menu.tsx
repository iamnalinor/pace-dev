import { useRef, useState } from "react";
import { View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useTaskGoneBack } from "#app/shared/task-opener.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ListRow } from "#app/ui/list-row.tsx";
import { Popover } from "#app/ui/popover.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { Text } from "#app/ui/text.tsx";
import { toastQuote, useToast } from "#app/ui/toast.tsx";

/** Deletes the task and leaves for where it was opened from; the toast's Undo brings it back. */
const useDeleteTask = (view: TaskViewModel): (() => Promise<void>) => {
  const t = useT();
  const { actions } = usePace();
  const back = useTaskGoneBack();
  const toast = useToast();
  const run = useRunAction();
  return async () => {
    const result = await run(actions.deleteTask(view.id));
    if (!result.ok) {
      return;
    }
    back();
    const [revocation] = result.value;
    toast.show({
      message: t("task.deleted", { title: toastQuote(view.title) }),
      ...(revocation !== undefined && {
        action: {
          label: t("common.undo"),
          onPress: () => void run(actions.revoke(revocation.id)),
          undoes: [revocation.id],
        },
      }),
    });
  };
};

/** «Удалить задачу?» with the destructive «Удалить» and «Отмена», in the place of the item. */
const DeleteConfirm = ({
  onCancel,
  onDelete,
}: {
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}) => {
  const t = useT();
  const focus = useConfirmFocus();
  return (
    <View className="gap-3 px-row-x py-3">
      <Text role="body">{t("task.deleteAsk")}</Text>
      <View className="flex-row gap-2">
        <Button
          onPress={onCancel}
          ref={focus.cancelRef(t("task.deleteAsk"))}
          variant="secondary"
          width="fill"
        >
          {t("common.cancel")}
        </Button>
        <Button onPress={onDelete} variant="destructive" width="fill">
          {t("common.delete")}
        </Button>
      </View>
    </View>
  );
};

const MenuItems = ({
  isConfirming,
  onAsk,
  onCloseAs,
  onDelete,
  onKeep,
  view,
}: {
  readonly view: TaskViewModel;
  readonly isConfirming: boolean;
  readonly onAsk: () => void;
  readonly onKeep: () => void;
  readonly onCloseAs: () => void;
  readonly onDelete: () => void;
}) => {
  const t = useT();
  // Plain buttons in the popover's (or the sheet's) dialog, not a `menu`: a menu promises
  // menuitems and arrow keys, and the delete confirm in place is no menu item (UI review I2).
  return (
    <View>
      {view.closed === null ? (
        <ListRow
          leading={<Icon name="calendar-clock" />}
          onPress={onCloseAs}
          title={t("task.closeAs")}
        />
      ) : null}
      {isConfirming ? (
        <DeleteConfirm onCancel={onKeep} onDelete={onDelete} />
      ) : (
        <ListRow leading={<Icon name="trash-2" />} onPress={onAsk} title={t("task.delete")} />
      )}
    </View>
  );
};

/**
The ⋯ menu: «Close as…» (the visible twin of Done's long press) and «Delete the task», which
turns into its own confirm in place. Escape (or a tap outside) first cancels the confirm and only
then closes the menu. A popover under the button on a computer, a sheet on a phone; either is a
dialog named by the menu's label, holding buttons.
*/
export const TaskMenu = ({
  onCloseAs,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onCloseAs: () => void;
}) => {
  const t = useT();
  const isWide = useIsWide();
  const anchorRef = useRef<View>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const remove = useDeleteTask(view);
  const close = (): void => {
    setIsOpen(false);
    setIsConfirming(false);
  };
  const dismiss = (): void => {
    if (isConfirming) {
      setIsConfirming(false);
      return;
    }
    close();
  };
  const items = (
    <MenuItems
      isConfirming={isConfirming}
      onAsk={() => {
        setIsConfirming(true);
      }}
      onCloseAs={() => {
        close();
        onCloseAs();
      }}
      onDelete={() => {
        close();
        void remove();
      }}
      onKeep={() => {
        setIsConfirming(false);
      }}
      view={view}
    />
  );
  return (
    <>
      <View ref={anchorRef}>
        <IconButton
          icon="ellipsis"
          label={t("task.menu")}
          onPress={() => {
            setIsOpen(true);
          }}
        />
      </View>
      {isWide ? (
        // Always there on a wide window, opened by `open`: it plays its exit as it closes.
        <Popover anchor={anchorRef} label={t("task.menu")} onClose={dismiss} open={isOpen}>
          {items}
        </Popover>
      ) : null}
      {isWide ? null : (
        <Sheet
          closeLabel={t("common.close")}
          name="task-menu"
          onClose={dismiss}
          open={isOpen}
          title={t("task.menu")}
        >
          {items}
        </Sheet>
      )}
    </>
  );
};
