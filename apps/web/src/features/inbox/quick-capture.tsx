import { Plus } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { toast } from "sonner";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";

/** "Capture a thought…": Enter files the text into the inbox exactly as typed. */
export const QuickCapture = () => {
  const t = useT();
  const { actions } = useServices();
  const [text, setText] = useState("");

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>): Promise<void> => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || text.trim() === "") {
      return;
    }
    event.preventDefault();
    const result = await actions.captureInbox(text);
    if (result.ok) {
      setText("");
      toast(t("inbox.captured"));
    } else {
      toast.error(actionErrorText(t, result.error));
    }
  };

  return (
    <label className="mx-4 mb-6 flex h-[50px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 focus-within:ring-[3px] focus-within:ring-accent/40">
      <Plus aria-hidden="true" className="size-[18px] text-muted" strokeWidth={1.75} />
      <input
        aria-label={t("inbox.captureLabel")}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
        enterKeyHint="done"
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          void onKeyDown(event);
        }}
        placeholder={t("inbox.capturePlaceholder")}
        value={text}
      />
    </label>
  );
};
