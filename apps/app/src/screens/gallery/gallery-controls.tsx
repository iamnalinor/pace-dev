import { useState } from "react";
import { View } from "react-native";

import type { ThemePreference } from "#app/platform/theme.ts";
import type { GalleryData } from "@pace/core/testing";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { CheckCircle } from "#app/ui/check-circle.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { BadgeAnchor, CountBadge } from "#app/ui/count-badge.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { ProgressBar } from "#app/ui/progress-bar.tsx";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";
import { Segmented } from "#app/ui/segmented.tsx";
import { Skeleton } from "#app/ui/skeleton.tsx";
import { Slider } from "#app/ui/slider.tsx";
import { Switch } from "#app/ui/switch.tsx";
import { Tag } from "#app/ui/tag.tsx";

import { Section } from "./gallery-kit.tsx";

const NOTHING = (): void => undefined;

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** The slider's steps (the task's progress: tenths). */
const STEPS = 10;

/** Every variant at both sizes, the disabled and busy look, the longest label, a shortcut. */
const ButtonsSection = () => {
  const t = useT();
  return (
    <Section title="dev.gallery.controls.buttons">
      <View className="flex-row flex-wrap gap-2">
        <Button onPress={NOTHING} shortcut={HOTKEYS.primary} width="hug">
          {t("dev.gallery.controls.primary")}
        </Button>
        <Button icon="plus" onPress={NOTHING} variant="secondary" width="hug">
          {t("dev.gallery.controls.secondary")}
        </Button>
        <Button onPress={NOTHING} variant="plain" width="hug">
          {t("dev.gallery.controls.plain")}
        </Button>
        <Button onPress={NOTHING} variant="destructive" width="hug">
          {t("dev.gallery.controls.destructive")}
        </Button>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button onPress={NOTHING} size="small" width="hug">
          {t("dev.gallery.controls.primary")}
        </Button>
        <Button onPress={NOTHING} size="small" variant="secondary" width="hug">
          {t("dev.gallery.controls.secondary")}
        </Button>
        <Button disabled onPress={NOTHING} width="hug">
          {t("dev.gallery.pressable.disabled")}
        </Button>
        <Button busy onPress={NOTHING} variant="secondary" width="hug">
          {t("dev.gallery.controls.busy")}
        </Button>
      </View>
      <Button onPress={NOTHING} width="fill">
        {t("dev.gallery.controls.long")}
      </Button>
    </Section>
  );
};

/** Icon buttons at rest, selected, disabled, busy, and with the worst count on the bell. */
const IconButtonsSection = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  return (
    <Section title="dev.gallery.controls.iconButtons">
      <View className="flex-row flex-wrap items-center gap-2">
        <IconButton icon="pencil" label={t("task.edit")} onPress={NOTHING} size="bar" />
        <IconButton icon="moon" label={t("settings.nightHours")} onPress={NOTHING} selected />
        <IconButton disabled icon="trash-2" label={t("task.delete")} onPress={NOTHING} />
        <IconButton
          busy
          icon="refresh-cw"
          label={t("dev.gallery.controls.busy")}
          onPress={NOTHING}
        />
        <IconButton
          badge={{ count: data.inboxCount, tone: "neutral" }}
          icon="bell"
          label={t("notifications.open")}
          onPress={NOTHING}
          size="bar"
        />
        <BadgeAnchor count={data.inboxCount} tone="danger">
          <Icon name="inbox" size="bar" />
        </BadgeAnchor>
        <CountBadge count={data.inboxCount} />
      </View>
    </Section>
  );
};

/** Chips: a radio group of projects (worst names), a filter, a picker chip, a disabled action. */
const ChipsSection = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const [project, setProject] = useState(data.projects[0]?.id ?? "");
  const [isFiltered, setIsFiltered] = useState(true);
  return (
    <Section title="dev.gallery.controls.chips">
      {data.projects.length === 0 ? null : (
        <RadioChips
          choices={data.projects.map((one) => ({
            color: one.color,
            text: one.name,
            value: one.id,
          }))}
          label={t("now.filterByProject")}
          onChange={setProject}
          value={project}
        />
      )}
      <View className="flex-row flex-wrap gap-x-2">
        <Chip
          checked={isFiltered}
          onPress={() => {
            setIsFiltered((on) => !on);
          }}
        >
          {t("dev.gallery.controls.filter")}
        </Chip>
        <Chip expanded icon="clock" onPress={NOTHING}>
          {t("dev.gallery.controls.picker")}
        </Chip>
        <Chip disabled onPress={NOTHING}>
          {t("dev.gallery.pressable.disabled")}
        </Chip>
      </View>
    </Section>
  );
};

/** Tags from data in a half-width column: they end in "…" and never push the row. */
const TagsSection = ({ data }: { readonly data: GalleryData }) => (
  <Section title="dev.gallery.section.tags">
    <View className="w-1/2 gap-1">
      {data.projects.map((project) => (
        <View className="flex-row items-center gap-2" key={project.id}>
          <Tag hue={project.color}>{project.name}</Tag>
          <Tag hue={null}>{project.name}</Tag>
        </View>
      ))}
    </View>
  </Section>
);

/** The segmented control, switches and toggle and select rows. */
const ChoicesSection = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [isOn, setIsOn] = useState(true);
  const [picked, setPicked] = useState(data.projects[0]?.id ?? "");
  return (
    <Section title="dev.gallery.controls.choices">
      <Segmented
        label={t("settings.theme")}
        onChange={setTheme}
        options={THEME_PREFERENCES.map((value) => ({ label: t(`settings.theme.${value}`), value }))}
        value={theme}
      />
      <View className="flex-row items-center gap-2">
        <Switch isOn={isOn} label={t("settings.nightHours")} onChange={setIsOn} />
        <Switch
          isOn={!isOn}
          label={t("settings.nightHours")}
          onChange={(next) => {
            setIsOn(!next);
          }}
        />
        <Switch
          disabled
          isOn={false}
          label={t("dev.gallery.pressable.disabled")}
          onChange={NOTHING}
        />
      </View>
      <View className="rounded-lg bg-cell">
        <ListRow
          subtitle={t("settings.nightHours.hint")}
          title={t("settings.nightHours")}
          toggle={{ isOn, onChange: setIsOn }}
        />
        <RadioGroup
          label={t("task.moveTitle")}
          onChange={setPicked}
          value={picked}
          values={data.projects.map((project) => project.id)}
        >
          {data.projects.map((project) => (
            <ListRow key={project.id} select={project.id} title={project.name} titleLines={2} />
          ))}
        </RadioGroup>
      </View>
    </Section>
  );
};

/** The slider, checks, the progress bar, the skeleton shapes and an empty state. */
const StatesSection = () => {
  const t = useT();
  const [step, setStep] = useState(3);
  const [isChecked, setIsChecked] = useState(false);
  return (
    <Section title="dev.gallery.controls.states">
      <Slider
        label={t("task.progressAria")}
        max={STEPS}
        onChange={setStep}
        value={step}
        valueText={(at) => t("task.progressOf", { value: (at * 100) / STEPS })}
      />
      <ProgressBar label={t("task.progress")} value={step / STEPS} />
      <ProgressBar label={t("task.progress")} tone={{ hue: "violet" }} value={0.6} />
      <ProgressBar label={t("task.progress")} tone="warn" value={1} />
      <View className="flex-row items-center gap-2">
        <CheckCircle
          checked={isChecked}
          label={t("dev.gallery.controls.check")}
          onPress={() => {
            setIsChecked((on) => !on);
          }}
        />
        <CheckCircle checked label={t("dev.gallery.controls.check")} />
        <CheckCircle label={t("dev.gallery.controls.check")} />
      </View>
      <Skeleton label={t("sync.loadingData")} rows={2} />
      <Skeleton label={t("sync.loadingData")} rows={1} shape="listRow" />
      <Skeleton label={t("sync.loadingData")} rows={3} shape="text" />
      <EmptyState
        action={
          <Button onPress={NOTHING} size="small" variant="secondary" width="hug">
            {t("dev.gallery.controls.secondary")}
          </Button>
        }
        body={t("notifications.empty")}
        icon="inbox"
        title={t("inbox.empty")}
      />
    </Section>
  );
};

/**
The controls of the kit (Task 3.9; spec §4.2): buttons, icon buttons, chips, tags, the segmented
control, switches, toggle and select rows, the slider, checks, the progress bar, counts, skeletons
and an empty state, fed the set's worst names and counts.
*/
export const ControlSections = ({ data }: { readonly data: GalleryData }) => (
  <>
    <ButtonsSection />
    <IconButtonsSection data={data} />
    <ChipsSection data={data} />
    <TagsSection data={data} />
    <ChoicesSection data={data} />
    <StatesSection />
  </>
);
