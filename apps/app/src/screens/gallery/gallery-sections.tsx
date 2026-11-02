import type { ReactNode } from "react";

import { Text, View } from "react-native";

import type { GalleryData } from "@pace/core/testing";

import { useT } from "#app/app-state.tsx";
import { ActivityRow } from "#app/features/day/day-screen.tsx";
import { Item as NotificationItem } from "#app/features/notifications/notifications-screen.tsx";
import { ProjectChips } from "#app/features/now/project-chips.tsx";
import { SessionRow } from "#app/features/sessions/session-row.tsx";
import { SettingsLinks } from "#app/features/settings/settings-links.tsx";
import { TaskFooter } from "#app/features/task/task-footer.tsx";
import { TaskHeader } from "#app/features/task/task-header.tsx";
import { WeekGrid } from "#app/features/week/week-grid.tsx";
import { CardView } from "#app/screens/inbox-card.tsx";
import { TaskRows } from "#app/shared/task-list.tsx";
import { RunningRow } from "#app/shared/tracking/running-row.tsx";
import { ColorTag, IMPORTANCE_HUES } from "#app/ui/color.tsx";
import { CountBadge } from "#app/ui/count-badge.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { SidebarHeader } from "#app/ui/sidebar.tsx";
import { openTasksLabel } from "@pace/client";
import { formatDuration, type MessageKey } from "@pace/core";

import {
  dayRows,
  GALLERY_NOW,
  GALLERY_ZONE,
  inboxCards,
  nowRows,
  projectChips,
  runningViews,
  sessionRows,
  signInNotification,
  taskModel,
  weekModel,
} from "./gallery-models.ts";

/** How tall an hour of the week grid is here, and how narrow a day column may get on a phone. */
const HOUR_PX = 24;
const PHONE_COLUMN_PX = 72;

const NOTHING = (): void => undefined;

/** One section of the gallery: a heading and the components it shows. */
const Section = ({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: MessageKey;
}) => {
  const t = useT();
  return (
    <View className="gap-2 px-5 pt-6">
      <Text accessibilityRole="header" className="font-sans text-headline text-label-primary">
        {t(title)}
      </Text>
      {children}
    </View>
  );
};

/** Task rows, tags and chips: the components that carry the user's own words. */
export const TextSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const rows = nowRows(data);
  const chips = projectChips(data);
  return (
    <>
      <Section title="dev.gallery.section.tasks">
        {rows.length === 0 ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          <TaskRows label={t("dev.gallery.section.tasks")} rows={rows} />
        )}
      </Section>
      <Section title="dev.gallery.section.tags">
        <View className="flex-row flex-wrap gap-2">
          {data.projects.map((project) => (
            <ColorTag color={project.color} key={project.id}>
              {project.name}
            </ColorTag>
          ))}
          {(["asap", "prioritized", "normal", "nice_to_have"] as const).map((importance) => (
            <ColorTag color={IMPORTANCE_HUES[importance]} key={importance}>
              {t(`importance.${importance}`)}
            </ColorTag>
          ))}
        </View>
      </Section>
      <Section title="dev.gallery.section.chips">
        {chips.length === 0 ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          <ProjectChips chips={chips} onSelect={NOTHING} selected={null} />
        )}
      </Section>
    </>
  );
};

/** The running card, the Day rows and the Week grid. */
export const TimeSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const isWide = useIsWide();
  const running = runningViews(data);
  const rows = dayRows(data);
  const week = weekModel(data);
  return (
    <>
      <Section title="dev.gallery.section.running">
        {running.length === 0 ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          <View className="gap-3 rounded-xl border border-separator bg-cell p-4">
            {running.map((view) => (
              <RunningRow key={view.activityId} running={view} />
            ))}
          </View>
        )}
      </Section>
      <Section title="dev.gallery.section.day">
        {rows.length === 0 ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          rows.map((row) => (
            <ActivityRow
              key={row.activityId}
              onEdit={NOTHING}
              row={row}
              satRows={[]}
              zone={GALLERY_ZONE}
            />
          ))
        )}
      </Section>
      <Section title="dev.gallery.section.week">
        {data.blocks.length === 0 ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          <WeekGrid
            calendar={[]}
            hourPx={HOUR_PX}
            language={data.language}
            minColumnPx={isWide ? 0 : PHONE_COLUMN_PX}
            now={GALLERY_NOW}
            onPick={NOTHING}
            selectedKey={null}
            usage={[]}
            week={week}
          />
        )}
      </Section>
    </>
  );
};

/** The sidebar's header, settings, counts, sessions, inbox and the notification row. */
export const ChromeSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const sessions = sessionRows(data);
  const cards = inboxCards(data);
  const notification = signInNotification(data);
  return (
    <>
      <Section title="dev.gallery.section.sidebar">
        <View className="w-sidebar border border-separator bg-app px-3 pt-5">
          <SidebarHeader owner={data.ownerName} />
        </View>
      </Section>
      <Section title="dev.gallery.section.settings">
        <SettingsLinks />
      </Section>
      <Section title="dev.gallery.section.counts">
        {data.pluralCounts.map((count) => (
          <Text className="font-sans text-subhead font-normal text-label-primary" key={count}>
            {`${String(count)}: ${openTasksLabel(data.language, count)}`}
          </Text>
        ))}
        <Text className="font-sans text-subhead font-normal text-label-primary">
          {data.durations.map((minutes) => formatDuration(minutes, data.language)).join(" · ")}
        </Text>
      </Section>
      <Section title="dev.gallery.section.sessions">
        {sessions.length === 0 ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          sessions.map((row) => (
            <SessionRow
              isConfirming={false}
              key={row.id}
              onConfirming={NOTHING}
              onEnd={() => Promise.resolve(true)}
              row={row}
            />
          ))
        )}
      </Section>
      <Section title="dev.gallery.section.inbox">
        <View className="flex-row items-center gap-2">
          <Text className="font-sans text-subhead font-normal text-label-primary">
            {t("nav.inbox")}
          </Text>
          <CountBadge count={data.inboxCount} />
        </View>
        {cards.length === 0 ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          cards.map((card) => <CardView card={card} key={card.id} />)
        )}
      </Section>
      <Section title="dev.gallery.section.notification">
        {notification === null ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          <NotificationItem
            asking={{ id: null, set: NOTHING }}
            deliveries={[]}
            item={notification}
            listed={{ current: undefined, ids: new Set(), loadedAt: null }}
            zoned={{ language: data.language, now: GALLERY_NOW, zone: GALLERY_ZONE }}
          />
        )}
      </Section>
    </>
  );
};

/** The task screen's header and footer, from the first task of the set. */
export const TaskSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const view = taskModel(data);
  return (
    <>
      <Section title="dev.gallery.section.taskHeader">
        {view === null ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          <TaskHeader
            actions={{ onEdit: NOTHING, onGiveUp: NOTHING, view }}
            onProject={NOTHING}
            project={view.project}
          />
        )}
      </Section>
      <Section title="dev.gallery.section.taskFooter">
        {view === null ? (
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t("dev.gallery.nothing")}
          </Text>
        ) : (
          <TaskFooter onClose={NOTHING} view={view} />
        )}
      </Section>
    </>
  );
};
