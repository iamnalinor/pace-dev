import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "#app/app-state.tsx";
import { markOnboarded } from "#app/platform/onboarding.ts";
import { type Permission, PERMISSION_IDS, type PermissionId } from "#app/platform/permissions.ts";
import { Button } from "#app/ui/button.tsx";

import { PermissionText } from "./permission-card.tsx";
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
  onContinue,
  onLater,
}: {
  readonly onContinue: () => void;
  readonly onLater: () => void;
}) => {
  const t = useT();
  return (
    <Frame
      footer={
        <>
          <Button onPress={onContinue}>{t("onboarding.continue")}</Button>
          <Button onPress={onLater} variant="ghost">
            {t("onboarding.notNow")}
          </Button>
        </>
      }
    >
      <Text accessibilityRole="header" className="font-sans text-[26px] font-semibold text-fg">
        {t("onboarding.title")}
      </Text>
      <Text className="font-sans text-[15px] text-fg2">{t("onboarding.intro")}</Text>
      {PERMISSION_IDS.map((id) => (
        <PermissionText id={id} key={id} />
      ))}
    </Frame>
  );
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
  const isOpensSettings = permission.kind === "settings" || permission.state === "blocked";
  return (
    <Frame
      footer={
        <>
          <Button onPress={onRequest}>
            {t(isOpensSettings ? "permissions.openSettings" : "permissions.allow")}
          </Button>
          <Button onPress={onSkip} variant="ghost">
            {t("common.skip")}
          </Button>
        </>
      }
    >
      <Text className="font-mono text-[12px] text-muted">
        {t("onboarding.step", { index: index + 1, total })}
      </Text>
      <PermissionText id={permission.id} />
      {isOpensSettings ? (
        <Text className="font-sans text-[13px] text-muted">{t("permissions.settingsHint")}</Text>
      ) : null}
    </Frame>
  );
};

/**
The first run: what Pace will ask for and why, then each permission that is not on yet in
turn. A dialog's answer moves on by itself; a settings screen moves on once it is granted
(or skipped). Seen once per phone; Settings → Permissions has the same buttons later.
*/
export const OnboardingScreen = () => {
  const router = useRouter();
  const { byId, list, request } = usePermissions();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [asked, setAsked] = useState<ReadonlySet<PermissionId>>(() => new Set());
  // The step shown is the first one still waiting for an answer: granted on a settings screen
  // or answered in a dialog, it is passed over.
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
  const isDone = phase.kind === "done" || (phase.kind === "step" && shown === -1);
  useEffect(() => {
    if (!isDone) {
      return;
    }
    void (async () => {
      await markOnboarded();
      router.replace("/");
    })();
  }, [isDone, router]);
  const currentId = phase.kind === "step" ? phase.queue[shown] : undefined;
  const current = currentId === undefined ? undefined : byId(currentId);
  if (current !== undefined && phase.kind === "step") {
    return (
      <Step
        index={shown}
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
  if (isDone) {
    return <View className="flex-1 bg-bg" />;
  }
  return (
    <Intro
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
