import { useState } from "react";
import { View } from "react-native";

import type { InboxCard } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { Text } from "#app/ui/text.tsx";
import { toastQuote } from "#app/ui/toast.tsx";

import { useCaptureActions } from "./use-capture-actions.ts";
import { useGuess } from "./use-guess.ts";

/** Lines of a capture before «Show all». */
const CAPTURE_LINES = 4;
/** Before the row is laid out (or where it never is): a text this long may run past them. */
const LONG_CAPTURE = 160;

/**
A capture verbatim (four lines at most; «Show all» opens the rest in a disclosure, offered when the
clamp cut the text as laid out, by length only until then), its guess
under it, and a compact Accept with Delete beside it: tonal, so N captures are not N accent bars
(F-CMP-15). The actions sit beside the row, not in it (a control in a button is nested
interactive); the row itself opens the details.
*/
export const CaptureRow = ({
  card,
  isSelected,
  onOpen,
}: {
  readonly card: InboxCard;
  readonly isSelected: boolean;
  readonly onOpen: () => void;
}) => {
  const t = useT();
  const guess = useGuess(card);
  const { accept, remove } = useCaptureActions(card);
  const [isFull, setIsFull] = useState(false);
  // Measured once laid out; `null` until then, when the length stands in.
  const [isClamped, setIsClamped] = useState<boolean | null>(null);
  const isCut = isClamped ?? card.text.length > LONG_CAPTURE;
  const quote = toastQuote(card.text);
  return (
    <View>
      <View className="flex-row">
        <View className="min-w-0 flex-1">
          <ListRow
            onPress={onOpen}
            onTitleClamped={setIsClamped}
            selected={isSelected}
            subtitle={guess.line}
            testID="inbox-capture"
            title={card.text}
            titleLines={CAPTURE_LINES}
          />
        </View>
        <View className="items-end gap-1 py-row-y pr-row-x">
          <Button
            label={`${t("common.accept")}: ${quote}`}
            onPress={() => {
              void accept();
            }}
            size="small"
            variant="secondary"
          >
            {t("common.accept")}
          </Button>
          <Button
            label={`${t("common.delete")}: ${quote}`}
            onPress={() => {
              void remove();
            }}
            size="small"
            variant="plain"
          >
            {t("common.delete")}
          </Button>
        </View>
      </View>
      {isCut || isFull ? (
        <Disclosure
          label={t("task.showFull")}
          onToggle={() => {
            setIsFull((open) => !open);
          }}
          open={isFull}
        >
          <View className="mx-gutter mb-3 mt-2 rounded-md bg-inset p-3">
            <Text role="callout" selectable>
              {card.text}
            </Text>
          </View>
        </Disclosure>
      ) : null}
    </View>
  );
};
