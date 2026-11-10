import { useRouter } from "expo-router";
import { memo } from "react";

import { useLanguage, usePace, useT } from "#app/app-state.tsx";
import { useSearchParam } from "#app/shared/use-search-param.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { type ListSection, SectionedList } from "#app/ui/sectioned-list.tsx";
import { Shell } from "#app/ui/shell.tsx";
import {
  type InboxCard,
  reviewDecisions,
  type ReviewRow as ReviewItem,
  waitingCount,
} from "@pace/client";
import { plural } from "@pace/core";

import { CaptureRow } from "./capture-row.tsx";
import { InboxPane, InboxSheet, type Picked } from "./inbox-detail.tsx";
import { ReviewRow } from "./review-row.tsx";

type Entry = Picked;

const entryKey = (entry: Entry): string =>
  entry.kind === "capture" ? entry.card.id : `review:${entry.row.taskId}`;

const pickedKey = (picked: null | Picked): null | string =>
  picked === null ? null : entryKey(picked);

/** The Inbox's own empty state: what lands here, and the way to put something in. */
const NothingWaiting = () => {
  const t = useT();
  const router = useRouter();
  return (
    <EmptyState
      action={
        <Button
          onPress={() => {
            router.push("/");
          }}
          size="small"
          variant="secondary"
        >
          {t("inbox.openLine")}
        </Button>
      }
      body={t("inbox.emptyBody")}
      title={t("inbox.empty")}
    />
  );
};

/** The decisions then the captures, as the list's sections. */
const sectionsOf = (
  decisions: readonly ReviewItem[],
  cards: readonly InboxCard[],
  t: ReturnType<typeof useT>,
): readonly ListSection<Entry>[] => [
  {
    count: decisions.length,
    key: "review",
    rows: decisions.map((row): Entry => ({ kind: "review", row })),
    title: t("review.title"),
  },
  {
    key: "notes",
    rows: cards.map((card): Entry => ({ card, kind: "capture" })),
    title: t("inbox.notes"),
  },
];

const InboxPage = ({
  onPick,
  onRemoved,
  picked,
  sections,
  waiting,
}: {
  readonly picked: null | Picked;
  readonly onPick: (picked: Picked) => void;
  readonly onRemoved: (entry: Entry) => void;
  readonly sections: readonly ListSection<Entry>[];
  readonly waiting: number;
}) => {
  const t = useT();
  const language = useLanguage();
  const selected = pickedKey(picked);
  return (
    <Screen
      header={
        <ScreenHeader
          subtitle={
            waiting === 0
              ? undefined
              : plural(language, waiting, {
                  few: t("inbox.waiting.few"),
                  many: t("inbox.waiting.many"),
                  one: t("inbox.waiting.one"),
                  other: t("inbox.waiting.other"),
                })
          }
          title={t("inbox.title")}
          variant="top"
        />
      }
      scroller={(scroll) => (
        <SectionedList
          empty={<NothingWaiting />}
          renderRow={(entry) =>
            entry.kind === "capture" ? (
              <CaptureRow
                card={entry.card}
                isSelected={selected === entryKey(entry)}
                onOpen={() => {
                  onPick(entry);
                }}
                onRemoved={() => {
                  onRemoved(entry);
                }}
              />
            ) : (
              <ReviewRow
                isSelected={selected === entryKey(entry)}
                onOpen={() => {
                  onPick(entry);
                }}
                onRemoved={() => {
                  onRemoved(entry);
                }}
                row={entry.row}
              />
            )
          }
          rowKey={entryKey}
          scroll={scroll}
          sections={sections}
        />
      )}
    />
  );
};

/**
The one place for what waits on the person (a tab on a phone, a sidebar row beside it): the
decisions the rules want («To sort») first, then each capture verbatim with its guess. A row
opens its details: beside the list on a wide window, in a sheet on a phone. What is open is
looked up again on every change, so an accepted or deleted capture closes its details.
*/
export const InboxScreen = memo(function InboxScreen() {
  const t = useT();
  const isWide = useIsWide();
  const { hooks } = usePace();
  const inbox = hooks.useInbox();
  const review = hooks.useReview();
  const decisions = reviewDecisions(review);
  const sections = sectionsOf(decisions, inbox.cards, t);
  // What is open is in the address (`?open=<key>`, feedback 5 item 6): a reload opens it again.
  const [openKey, setOpenKey, forgetOpen] = useSearchParam("open");
  const picked =
    sections.flatMap((section) => section.rows).find((entry) => entryKey(entry) === openKey) ??
    null;
  const close = (): void => {
    setOpenKey(null);
  };
  const page = (
    <InboxPage
      onPick={(entry) => {
        setOpenKey(entryKey(entry));
      }}
      onRemoved={(entry) => {
        // The note open beside the list, accepted or deleted from its row.
        if (entryKey(entry) === openKey) {
          forgetOpen();
        }
      }}
      picked={picked}
      sections={sections}
      waiting={waitingCount(inbox, review)}
    />
  );
  if (isWide) {
    return (
      <Shell
        content={page}
        inspector={
          picked === null ? undefined : (
            <InboxPane onClose={close} onDone={forgetOpen} picked={picked} />
          )
        }
        inspectorLabel={t("inbox.details")}
        inspectorOpen={picked !== null}
        onInspectorClose={close}
      />
    );
  }
  return (
    <>
      {page}
      <OverlayPresence value={picked}>
        {(kept) => <InboxSheet onClose={close} onDone={forgetOpen} picked={kept} />}
      </OverlayPresence>
    </>
  );
});
