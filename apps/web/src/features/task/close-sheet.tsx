import type { TaskViewModel } from "@pace/client";

import { useLanguage } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatList } from "#web/shared/format/number.ts";
import { Button } from "#web/shared/ui/button.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#web/shared/ui/sheet.tsx";

import { CloseOther, ClosePreviewList, ExactSwitch, WhenPicker } from "./close-parts.tsx";
import { problemName } from "./close-preview.ts";
import { type CloseMode, useCloseForm } from "./use-close-form.ts";

export type { CloseMode } from "./use-close-form.ts";

type FormProps = {
  readonly view: TaskViewModel;
  readonly mode: CloseMode;
  readonly onDone: () => void;
};

const useTitles = (view: TaskViewModel, mode: CloseMode, sending: readonly string[]) => {
  const t = useT();
  const language = useLanguage();
  const names = view.problems
    .filter((problem) => sending.includes(problem.id))
    .map((problem) => problemName(problem));
  switch (mode) {
    case "submit": {
      return {
        title: t("close.submitTitle", { problems: formatList(names, language) }),
        subtitle: t("close.subtitleSolved", { title: view.title }),
        when: t("close.whenSubmitted"),
      };
    }
    case "done": {
      return { subtitle: view.title, title: t("close.doneTitle"), when: t("close.whenDone") };
    }
    case "close": {
      return { subtitle: view.title, title: t("close.closeTitle"), when: t("close.whenClosed") };
    }
  }
};

/** The sheet's body; it mounts on open, so every opening starts from "now". */
const CloseForm = ({ mode, onDone, view }: FormProps) => {
  const t = useT();
  const form = useCloseForm({ mode, onDone, view });
  const titles = useTitles(view, mode, form.sending);
  const { at } = form;
  return (
    <>
      <SheetHeader>
        <SheetTitle>{titles.title}</SheetTitle>
        <SheetDescription>{titles.subtitle}</SheetDescription>
      </SheetHeader>
      <WhenPicker at={at} legend={titles.when} onWhen={form.setWhen} view={view} when={form.when} />
      <ExactSwitch isExact={form.isExact} onChange={form.setIsExact} />
      {form.preview !== null && at !== null && (
        <ClosePreviewList at={at} isSubmit={mode === "submit"} preview={form.preview} />
      )}
      <SheetFooter>
        <SheetClose asChild>
          <Button className="h-[50px] flex-1 rounded-lg text-[15px]" variant="secondary">
            {t("common.cancel")}
          </Button>
        </SheetClose>
        <Button
          className="h-[50px] flex-2 rounded-lg text-[15px] font-semibold"
          disabled={at === null}
          onClick={() => {
            if (at !== null) {
              void form.finish(at);
            }
          }}
          variant="accent"
        >
          {t(mode === "submit" ? "close.submit" : "close.done")}
        </Button>
      </SheetFooter>
      <CloseOther
        isDisabled={at === null}
        onCloseAs={(outcome) => {
          if (at !== null) {
            void form.closeAs(at, outcome);
          }
        }}
        onReason={form.setReason}
        reason={form.reason}
        reasons={form.reasons}
      />
    </>
  );
};

type Props = {
  readonly view: TaskViewModel;
  readonly mode: CloseMode;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

/** Artboard 4: when it happened, how exactly, what it means, and the other ways to close. */
export const CloseSheet = ({ isOpen, mode, onOpenChange, view }: Props) => (
  <Sheet onOpenChange={onOpenChange} open={isOpen}>
    <SheetContent>
      <CloseForm
        mode={mode}
        onDone={() => {
          onOpenChange(false);
        }}
        view={view}
      />
    </SheetContent>
  </Sheet>
);
