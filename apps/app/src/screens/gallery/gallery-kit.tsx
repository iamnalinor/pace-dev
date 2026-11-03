import type { ReactNode } from "react";

import { Text as NativeText, View } from "react-native";

import type { GalleryData } from "@pace/core/testing";

import { useT } from "#app/app-state.tsx";
import { CountBadge } from "#app/ui/count-badge.tsx";
import { Icon, type IconSize, type IconTone } from "#app/ui/icon.tsx";
import { Link } from "#app/ui/link.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { Text } from "#app/ui/text.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import {
  formatCount,
  formatDuration,
  isTabular,
  type MessageKey,
  shadow,
  TYPE_ROLES,
} from "@pace/core";

const NOTHING = (): void => undefined;

const BOX = "min-h-12 justify-center rounded-md bg-cell px-4 py-2";
const LABEL = "font-sans text-callout font-medium text-label-primary";

/** What a numeric role shows: a count with a thousands group, and a duration past an hour. */
const NUMERIC_SAMPLE = { count: 1284, minutes: 125 } as const;

const ICON_SIZES: readonly IconSize[] = ["inline", "control", "bar"];
const ICON_TONES: readonly IconTone[] = [
  "secondary",
  "primary",
  "tertiary",
  "accent",
  "danger",
  "warn",
];

/** One section of the kit's part of the gallery: a heading and the components it shows. */
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
      <Text level={2} role="headline">
        {t(title)}
      </Text>
      {children}
    </View>
  );
};

/**
The kit's Text, Icon and Link (spec §3.2, §3.6, §4.1.1): every type role, a name from data beside a
control in a row (it yields and ends in "…" with its full value in the title), a clamped capture,
the icon sizes and tones, and the worst-case address as a link.
*/
const TextIconLinkSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  return (
    <>
      <Section title="dev.gallery.section.type">
        {TYPE_ROLES.map((role) => (
          <Text key={role} role={role}>
            {isTabular(role)
              ? `${formatCount(NUMERIC_SAMPLE.count, data.language)} · ${formatDuration(NUMERIC_SAMPLE.minutes, data.language)}`
              : t("dev.gallery.type.sample")}
          </Text>
        ))}
        <Text level={2} role="subhead" tone="secondary">
          {t("dev.gallery.type.heading")}
        </Text>
      </Section>
      <Section title="dev.gallery.section.textPolicy">
        {data.projects.map((project) => (
          <View className="flex-row items-center gap-2" key={project.id}>
            <Icon name="folder" />
            <Text className="flex-1" policy="truncate" role="body">
              {project.name}
            </Text>
            <CountBadge count={data.inboxCount} />
          </View>
        ))}
        {data.inboxTexts[0] === undefined ? null : (
          <Text lines={4} policy="clamp" role="callout">
            {data.inboxTexts[0]}
          </Text>
        )}
      </Section>
      <Section title="dev.gallery.section.icons">
        {ICON_SIZES.map((size) => (
          <View className="flex-row flex-wrap items-center gap-3" key={size}>
            {ICON_TONES.map((tone) => (
              <Icon key={tone} name="calendar-days" size={size} tone={tone} />
            ))}
          </View>
        ))}
        <View className="flex-row items-center gap-1">
          <Icon name="repeat" size="inline" />
          <Text role="footnote" tone="secondary">
            {t("dev.gallery.icons.inline")}
          </Text>
        </View>
      </Section>
      <Section title="dev.gallery.section.link">
        <Link className="min-h-12 flex-row items-center gap-2 rounded-md" href="/">
          <Icon name="zap" />
          <Text role="body" tone="accent">
            {t("dev.gallery.link.inside")}
          </Text>
        </Link>
        {data.link === null ? null : (
          <Link className="min-h-12 flex-row items-center gap-2 rounded-md" href={data.link}>
            <Icon name="external-link" />
            <Text className="flex-1" policy="truncate" role="body" tone="accent">
              {data.link}
            </Text>
          </Link>
        )}
      </Section>
    </>
  );
};

/**
The kit's state layer (`ui/pressable.tsx`) in each of its states, in the gallery's language: hover,
press and the focus ring are tried by hand on it (web), the ripple on a phone. Its labels are the
longest a control of the kit carries here, in Russian. The opaque child and the raised control are
the break-ui cases of the overlay: it shows above the child, and the control's shadow stays.
*/
const StateLayerSection = () => {
  const t = useT();
  const { scheme } = useTheme();
  return (
    <View className="gap-2 px-5 pt-6">
      <Text level={2} role="headline">
        {t("dev.gallery.section.pressable")}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Pressable className={BOX} onPress={NOTHING} role="button">
          <NativeText className={LABEL}>{t("dev.gallery.pressable.rest")}</NativeText>
        </Pressable>
        <Pressable className={BOX} disabled onPress={NOTHING} role="button">
          <NativeText className={LABEL}>{t("dev.gallery.pressable.disabled")}</NativeText>
        </Pressable>
        <Pressable className={BOX} onPress={NOTHING} ripple="borderless" role="button">
          <NativeText className={LABEL}>{t("dev.gallery.pressable.borderless")}</NativeText>
        </Pressable>
        <Pressable checked className={BOX} onPress={NOTHING} role="checkbox">
          <NativeText className={LABEL}>{t("dev.gallery.pressable.checked")}</NativeText>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {/* An opaque child fills the control: the overlay must still show above it. */}
        <Pressable className="min-h-12 overflow-hidden rounded-md" onPress={NOTHING} role="button">
          <View className="min-h-12 justify-center bg-accent px-4 py-2">
            <NativeText className="font-sans text-callout font-medium text-accent-on">
              {t("dev.gallery.pressable.opaque")}
            </NativeText>
          </View>
        </Pressable>
        {/* A raised control keeps its own shadow while hovered and pressed. */}
        <Pressable
          className="min-h-12 justify-center rounded-md bg-elevated px-4 py-2"
          onPress={NOTHING}
          role="button"
          style={{ boxShadow: shadow(scheme, "overlay") }}
        >
          <NativeText className={LABEL}>{t("dev.gallery.pressable.elevated")}</NativeText>
        </Pressable>
      </View>
      <View
        aria-label={t("dev.gallery.section.pressable")}
        className="flex-row flex-wrap gap-2"
        role="tablist"
      >
        <Pressable className={BOX} onPress={NOTHING} role="tab" selected>
          <NativeText className={LABEL}>{t("dev.gallery.pressable.selected")}</NativeText>
        </Pressable>
        <Pressable className={BOX} onPress={NOTHING} role="tab" selected={false}>
          <NativeText className={LABEL}>{t("dev.gallery.pressable.unselected")}</NativeText>
        </Pressable>
      </View>
    </View>
  );
};

/** The kit's part of the gallery: the state layer, then type, icons and links. */
export const KitSections = ({ data }: { readonly data: GalleryData }) => (
  <>
    <StateLayerSection />
    <TextIconLinkSections data={data} />
  </>
);
