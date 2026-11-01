import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Permission, PermissionId } from "#app/platform/permissions.ts";

import { useT } from "#app/app-state.tsx";
import { markOnboarded } from "#app/platform/onboarding.ts";
import { Button } from "#app/ui/button.tsx";

import { PermissionText, type UsageStep, UsageSteps, useUsageGuide } from "./permission-card.tsx";
import { usePermissions } from "./use-permissions.ts";

type Phase =
  | { readonly kind: "done" }
  | { readonly kind: "intro" }
  | { readonly kind: "step"; readonly queue: readonly PermissionId[]; readonly index: number };

const Frame = ({
  children,
  footer,
}: {
  readonly children: React.ReactNode;
  readonly footer: React.ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 justify-between bg-bg px-6"
      style={{ paddingBottom: insets.bottom + 24, paddingTop: insets.top + 32 }}
    >
      <View className="gap-5">{children}</View>
      <View className="gap-2">{footer}</View>
    </View>
  );
};

/** Step one: every permission Pace will ask for and what it is for, before any dialog. */
const Intro = ({
  ids,
  onContinue,
  onLater,
}: {
  readonly ids: readonly PermissionId[];
  readonly onContinue: () => void;
  readonly onLater: () => void;
}) => {
  const t = useT();
  return (
    <Frame
      footer={
        <>
          <Button onPress={onContinue} width="fill">
            {t("onboarding.continue")}
          </Button>
          <Button onPress={onLater} variant="ghost" width="fill">
            {t("onboarding.notNow")}
          </Button>
        </>
      }
    >
      <Text accessibilityRole="header" className="font-sans text-[26px] font-semibold text-fg">
        {t("onboarding.title")}
      </Text>
      <Text className="font-sans text-[15px] text-fg2">{t("onboarding.intro")}</Text>
      {ids.map((id) => (
        <PermissionText id={id} key={id} />
      ))}
    </Frame>
  );
};

/** The step's main action and what it says: the usage guide's current step, or the permission's. */
const useStepAction = (
  permission: Permission,
  onRequest: () => void,
): { readonly label: string; readonly act: () => void; readonly guide: null | UsageStep } => {
  const t = useT();
  const guide = useUsageGuide(onRequest);
  if (permission.restricted && permission.state === "off") {
    return { act: guide.act, guide: guide.step, label: guide.label };
  }
  const isOpensSettings = permission.kind === "settings" || permission.state === "blocked";
  return {
    act: onRequest,
    guide: null,
    label: t(isOpensSettings ? "permissions.openSettings" : "permissions.allow"),
  };
};

/** One permission at a time: why, then the system's own dialog or settings screen. */
const Step = ({
  index,
  onRequest,
  onSkip,
  permission,
  total,
}: {
  readonly permission: Permission;
  readonly index: number;
  readonly total: number;
  readonly onRequest: () => void;
  readonly onSkip: () => void;
}) => {
  const t = useT();
  const action = useStepAction(permission, onRequest);
  const isOpensSettings = permission.kind === "settings" || permission.state === "blocked";
  return (
    <Frame
      footer={
        <>
          <Button onPress={action.act} width="fill">
            {action.label}
          </Button>
          <Button onPress={onSkip} variant="ghost" width="fill">
            {t("common.skip")}
          </Button>
        </>
      }
    >
      <Text className="font-sans text-[12px] tabular-nums text-muted">
        {t("onboarding.step", { index: index + 1, total })}
      </Text>
      <PermissionText id={permission.id} />
      {isOpensSettings && action.guide === null ? (
        <Text className="font-sans text-[13px] text-muted">{t("permissions.settingsHint")}</Text>
      ) : null}
      {action.guide === null ? null : <UsageSteps step={action.guide} />}
    </Frame>
  );
};

const STATE_INK: Readonly<Record<Permission["state"], string>> = {
  blocked: "text-muted",
  off: "text-muted",
  on: "text-fg",
};

/** The walk-through's end: what is on now, and where the rest is turned on later. */
const Summary = ({
  list,
  onStart,
}: {
  readonly list: readonly Permission[];
  readonly onStart: () => void;
}) => {
  const t = useT();
  return (
    <Frame
      footer={
        <Button onPress={onStart} width="fill">
          {t("onboarding.done.start")}
        </Button>
      }
    >
      <Text accessibilityRole="header" className="font-sans text-[26px] font-semibold text-fg">
        {t("onboarding.done.title")}
      </Text>
      <Text className="font-sans text-[15px] text-fg2">{t("onboarding.done.body")}</Text>
      {list.map((permission) => (
        <View
          accessibilityLabel={t(`permissions.${permission.id}`)}
          className="flex-row items-center justify-between gap-3"
          key={permission.id}
          role="group"
        >
          <Text className="font-sans text-[15px] text-fg">{t(`permissions.${permission.id}`)}</Text>
          <Text className={`font-sans text-[13px] ${STATE_INK[permission.state]}`}>
            {t(`permissions.${permission.state}`)}
          </Text>
        </View>
      ))}
    </Frame>
  );
};

/** The step shown: the first one still waiting for an answer (-1: none left), and its permission. */
const shownStepOf = (
  phase: Phase,
  byId: (id: PermissionId) => Permission | undefined,
  asked: ReadonlySet<PermissionId>,
): { readonly shown: number; readonly current: Permission | undefined } => {
  // Granted on a settings screen or answered in a dialog, a step is passed over.
  const isWaiting = (id: PermissionId): boolean => {
    const permission = byId(id);
    return (
      permission !== undefined &&
      permission.state !== "on" &&
      !(permission.kind === "dialog" && asked.has(id))
    );
  };
  const shown =
    phase.kind === "step"
      ? phase.queue.findIndex((id, index) => index >= phase.index && isWaiting(id))
      : -1;
  const currentId = phase.kind === "step" ? phase.queue[shown] : undefined;
  return { current: currentId === undefined ? undefined : byId(currentId), shown };
};

/** Once the walk-through is done: remembered, then on to Now. */
const useLeaveWhenDone = (isDone: boolean): void => {
  const router = useRouter();
  useEffect(() => {
    if (!isDone) {
      return;
    }
    void (async () => {
      await markOnboarded();
      router.replace("/");
    })();
  }, [isDone, router]);
};

/**
The first run: what Pace will ask for and why, then each permission that is not on yet in
turn. A dialog's answer moves on by itself; a settings screen moves on once it is granted
(or skipped). Seen once per phone; Settings → Permissions has the same buttons later.
*/
export const OnboardingScreen = () => {
  const { byId, ids, list, request } = usePermissions();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [asked, setAsked] = useState<ReadonlySet<PermissionId>>(() => new Set());
  const { current, shown } = shownStepOf(phase, byId, asked);
  // Every step answered or skipped: the summary, then Now once the person starts.
  const isSummary = phase.kind === "step" && shown === -1;
  const isDone = phase.kind === "done";
  useLeaveWhenDone(isDone);
  if (current !== undefined && phase.kind === "step") {
    return (
      <Step
        index={shown}
        key={current.id}
        onRequest={() => {
          void (async () => {
            await request(current);
            setAsked((before) => new Set([...before, current.id]));
          })();
        }}
        onSkip={() => {
          setPhase({ ...phase, index: shown + 1 });
        }}
        permission={current}
        total={phase.queue.length}
      />
    );
  }
  if (isSummary) {
    return (
      <Summary
        list={list ?? []}
        onStart={() => {
          setPhase({ kind: "done" });
        }}
      />
    );
  }
  if (isDone) {
    return <View className="flex-1 bg-bg" />;
  }
  return (
    <Intro
      ids={ids}
      onContinue={() => {
        const queue = (list ?? [])
          .filter((permission) => permission.state !== "on")
          .map((permission) => permission.id);
        setPhase(queue.length === 0 ? { kind: "done" } : { index: 0, kind: "step", queue });
      }}
      onLater={() => {
        setPhase({ kind: "done" });
      }}
    />
  );
};
