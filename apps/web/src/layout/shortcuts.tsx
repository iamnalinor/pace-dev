import { useState } from "react";

import type { MessageKey } from "@pace/core";

import { useT } from "#web/i18n.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#web/shared/ui/sheet.tsx";

import { useShortcuts } from "./use-shortcuts.ts";

const KEYS: readonly (readonly [string, MessageKey])[] = [
  ["n", "shortcuts.new"],
  ["j", "shortcuts.next"],
  ["k", "shortcuts.previous"],
  ["x", "shortcuts.check"],
  ["Esc", "shortcuts.close"],
  ["?", "shortcuts.help"],
];

/** The keyboard shortcuts and the `?` list that explains them. */
export const Shortcuts = () => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  useShortcuts(() => {
    setIsOpen(true);
  });
  return (
    <Sheet onOpenChange={setIsOpen} open={isOpen}>
      <SheetContent aria-describedby={undefined} closeLabel={t("common.close")}>
        <SheetHeader>
          <SheetTitle>{t("shortcuts.title")}</SheetTitle>
        </SheetHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          {KEYS.map(([key, label]) => (
            <div className="contents" key={key}>
              <dt>
                <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-sm border border-line bg-raised px-1.5 font-mono text-xs">
                  {key}
                </kbd>
              </dt>
              <dd className="text-fg2">{t(label)}</dd>
            </div>
          ))}
        </dl>
      </SheetContent>
    </Sheet>
  );
};
