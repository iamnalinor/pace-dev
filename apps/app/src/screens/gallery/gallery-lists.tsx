import { useState } from "react";
import { View } from "react-native";

import type { GalleryData } from "@pace/core/testing";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { CountBadge } from "#app/ui/count-badge.tsx";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { Group } from "#app/ui/group.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { Presence } from "#app/ui/presence.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { Text } from "#app/ui/text.tsx";
import { formatDuration } from "@pace/core";

const NOTHING = (): void => undefined;

/**
The kit's grouped list (spec §4.1.1, §5.0.3): a `SectionHeader` with the count, a `Group` of
`ListRow`s with the set's project names (two lines, then "…"), a picked row, a navigation row, a
compact row with a duration, and a row whose meta wraps. In the worst set the names are the long
Russian and unbreakable ones; the empty set leaves the projects group out entirely.
*/
export const ListSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const [first] = data.projects;
  return (
    <View className="pb-2">
      <SectionHeader count={data.projects.length} title={t("dev.gallery.section.lists")} />
      <Group separatorInset="icon">
        {data.projects.map((project) => (
          <ListRow
            key={project.id}
            leading={<Icon name="folder" />}
            onPress={NOTHING}
            selected={project.id === first?.id}
            title={project.name}
            titleLines={2}
            trailing={<CountBadge count={data.inboxCount} tone="neutral" />}
          />
        ))}
      </Group>
      <SectionHeader level={3} title={t("dev.gallery.lists.kinds")} />
      <Group>
        <ListRow href="/settings" title={t("dev.gallery.lists.navigation")} />
        <ListRow subtitle={t("dev.gallery.lists.subtitle")} title={t("dev.gallery.lists.static")} />
        {data.durations.map((minutes, index) => (
          <ListRow
            density="compact"
            // Durations may repeat; their place is what tells the rows apart.
            key={`${String(index)}-${String(minutes)}`}
            title={t("dev.gallery.lists.compact")}
            trailing={
              <Text role="numeric.value" tone="secondary">
                {formatDuration(minutes, data.language)}
              </Text>
            }
          />
        ))}
      </Group>
    </View>
  );
};

/**
The kit's `ScreenHeader` (spec §4.2.16, §5.0.2): a top-level header with a subtitle and two
actions, and a pushed one whose title is the set's longest project name (it wraps, never cut) with
the context and Back. A cell boxes each, so its gutter shows.
*/
export const HeaderSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const [first] = data.projects;
  return (
    <View className="gap-3 pb-2">
      <SectionHeader title={t("dev.gallery.section.headers")} />
      <View className="mx-gutter rounded-lg bg-cell">
        <ScreenHeader
          actions={
            <>
              <IconButton icon="bell" label={t("dev.gallery.headers.action")} onPress={NOTHING} />
              <IconButton icon="search" label={t("dev.gallery.headers.action")} onPress={NOTHING} />
            </>
          }
          subtitle={t("dev.gallery.headers.subtitle")}
          title={t("dev.gallery.headers.top")}
          variant="top"
        />
      </View>
      <View className="mx-gutter rounded-lg bg-cell">
        <ScreenHeader
          backLabel={t("common.back")}
          context={
            <Text policy="truncate" role="callout" tone="secondary">
              {t("dev.gallery.headers.context")}
            </Text>
          }
          onBack={NOTHING}
          title={first?.name ?? t("dev.gallery.headers.pushed")}
          variant="pushed"
        />
      </View>
    </View>
  );
};

/**
The kit's motion primitives (spec §4.1.1, §6): a `Disclosure` folding the set's projects (the
worst set's long names, the empty set's none: then no fold) and a `Presence` that rises in and
fades out a card on demand; with reduced motion both only fade.
*/
export const MotionSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const [isFoldOpen, setIsFoldOpen] = useState(false);
  const [isCardShown, setIsCardShown] = useState(true);
  return (
    <View className="gap-3 pb-6">
      <SectionHeader title={t("dev.gallery.section.motion")} />
      {data.projects.length === 0 ? null : (
        <Disclosure
          count={data.projects.length}
          label={t("dev.gallery.motion.fold")}
          onToggle={() => {
            setIsFoldOpen(!isFoldOpen);
          }}
          open={isFoldOpen}
        >
          <Group>
            {data.projects.map((project) => (
              <ListRow key={project.id} title={project.name} titleLines={2} />
            ))}
          </Group>
        </Disclosure>
      )}
      <View className="mx-gutter items-start gap-3">
        <Button
          onPress={() => {
            setIsCardShown(!isCardShown);
          }}
          variant="secondary"
        >
          {t(isCardShown ? "dev.gallery.motion.hide" : "dev.gallery.motion.show")}
        </Button>
        <Presence enter="rise" exit="fade" show={isCardShown}>
          <View className="rounded-lg bg-cell px-row-x py-row-y">
            <Text role="body">{t("dev.gallery.motion.card")}</Text>
          </View>
        </Presence>
      </View>
    </View>
  );
};
