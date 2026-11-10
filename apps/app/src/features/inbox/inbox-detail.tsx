import { ScrollView, View } from "react-native";

import type { InboxCard, ReviewRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { Group } from "#app/ui/group.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { Text } from "#app/ui/text.tsx";

import { ReviewAnswers, useReviewLine } from "./review-row.tsx";
import { useCaptureActions } from "./use-capture-actions.ts";
import { useGuess } from "./use-guess.ts";

/** What is open in the details: a capture or a decision. */
export type Picked =
  | { readonly kind: "capture"; readonly card: InboxCard }
  | { readonly kind: "review"; readonly row: ReviewRow };

const CaptureFacts = ({
  card,
  onDone,
}: {
  readonly card: InboxCard;
  readonly onDone: () => void;
}) => {
  const t = useT();
  const guess = useGuess(card);
  const { accept, remove } = useCaptureActions(card);
  return (
    <View className="gap-4">
      <Text role="body" selectable>
        {card.text}
      </Text>
      <Group inset={false}>
        {guess.rows.map((row) => (
          <ListRow
            key={row.label}
            title={row.label}
            trailing={
              <Text role="body" tone="secondary">
                {row.value}
              </Text>
            }
          />
        ))}
      </Group>
      <View className="gap-2">
        <Button
          onPress={() => {
            void (async () => {
              if (await accept()) {
                onDone();
              }
            })();
          }}
          shortcut={HOTKEYS.primary}
          width="fill"
        >
          {t("common.accept")}
        </Button>
        <Button
          onPress={() => {
            void (async () => {
              if (await remove()) {
                onDone();
              }
            })();
          }}
          variant="plain"
          width="fill"
        >
          {t("common.delete")}
        </Button>
      </View>
    </View>
  );
};

const ReviewFacts = ({ onDone, row }: { readonly row: ReviewRow; readonly onDone: () => void }) => {
  const line = useReviewLine(row);
  return (
    <View className="gap-4">
      <Text role="body" selectable>
        {row.title}
      </Text>
      <Text role="footnote" tone="secondary">
        {line}
      </Text>
      <ReviewAnswers onDone={onDone} row={row} />
    </View>
  );
};

const Facts = ({ onDone, picked }: { readonly picked: Picked; readonly onDone: () => void }) =>
  picked.kind === "capture" ? (
    <CaptureFacts card={picked.card} onDone={onDone} />
  ) : (
    <ReviewFacts onDone={onDone} row={picked.row} />
  );

const useHeading = (picked: Picked): string => {
  const t = useT();
  return t(picked.kind === "capture" ? "inbox.details" : "inbox.review.details");
};

/** A phone's details: the bottom sheet over the list. */
export const InboxSheet = ({
  onClose,
  onDone,
  picked,
}: {
  readonly picked: Picked;
  readonly onClose: () => void;
  /** After an answer removed what is open (accepted, deleted, decided): it goes without a step. */
  readonly onDone: () => void;
}) => {
  const t = useT();
  return (
    <Sheet
      closeLabel={t("common.close")}
      name="inbox-detail"
      onClose={onClose}
      open
      title={useHeading(picked)}
    >
      <Facts onDone={onDone} picked={picked} />
    </Sheet>
  );
};

/** A wide window's details, in the shell's inspector while something is selected. */
export const InboxPane = ({
  onClose,
  onDone,
  picked,
}: {
  readonly picked: Picked;
  readonly onClose: () => void;
  /** After an answer removed what is open (accepted, deleted, decided): it goes without a step. */
  readonly onDone: () => void;
}) => {
  const t = useT();
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 pb-10 pt-6">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Text level={2} role="title2">
            {useHeading(picked)}
          </Text>
        </View>
        <View className="-mr-2 h-6 justify-center">
          <IconButton icon="x" label={t("common.close")} onPress={onClose} />
        </View>
      </View>
      <Facts onDone={onDone} picked={picked} />
    </ScrollView>
  );
};
