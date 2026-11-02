import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { openAppInfo, type Permission } from "#app/platform/permissions.ts";
import { Button } from "#app/ui/button.tsx";
import { inkClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";

/** What a permission is called and why Pace wants it. */
export const PermissionText = ({ id }: { readonly id: Permission["id"] }) => {
  const t = useT();
  return (
    <View className="gap-0.5">
      <Text className="font-sans text-callout font-medium text-label-primary">
        {t(`permissions.${id}`)}
      </Text>
      <Text className="font-sans text-footnote text-label-secondary">
        {t(`permissions.${id}.why`)}
      </Text>
    </View>
  );
};

const STATE_CLASS: Readonly<Record<Permission["state"], string>> = {
  blocked: inkClass("red"),
  off: "text-label-secondary",
  on: inkClass("green"),
};

const USAGE_STEPS = [
  "permissions.usage.step1",
  "permissions.usage.step2",
  "permissions.usage.step3",
] as const;

export type UsageStep = 0 | 1 | 2;

/**
Usage access for an app installed from an APK (Android 13+ "restricted settings"): try the
switch (Android refuses, and only then offers the way out), allow restricted settings on App
info, then the switch again. One action at a time, the one for the step the person is on.
*/
export const useUsageGuide = (
  openUsageAccess: () => void,
): { readonly step: UsageStep; readonly label: string; readonly act: () => void } => {
  const t = useT();
  const [step, setStep] = useState<UsageStep>(0);
  if (step === 1) {
    return {
      act: () => {
        void openAppInfo();
        setStep(2);
      },
      label: t("permissions.appInfo"),
      step,
    };
  }
  return {
    act: () => {
      openUsageAccess();
      setStep((current) => (current === 0 ? 1 : current));
    },
    label: t("permissions.usage.open"),
    step,
  };
};

/** The three steps, the current one in full ink. */
export const UsageSteps = ({ step }: { readonly step: UsageStep }) => {
  const t = useT();
  return (
    <View className="gap-2">
      {USAGE_STEPS.map((key, index) => (
        <Text
          className={cx(
            "font-sans text-footnote",
            index === step ? "text-label-primary" : "text-label-secondary",
          )}
          key={key}
        >
          {t(key)}
        </Text>
      ))}
    </View>
  );
};

/** The card's body for restricted usage access: the steps and the action of the current one. */
const UsageGuide = ({ onRequest }: { readonly onRequest: () => void }) => {
  const guide = useUsageGuide(onRequest);
  return (
    <View className="items-start gap-3">
      <UsageSteps step={guide.step} />
      <Button onPress={guide.act} variant="secondary">
        {guide.label}
      </Button>
    </View>
  );
};

/** The button that turns it on: a dialog, or the Android screen where it is granted. */
export const PermissionAction = ({
  onRequest,
  permission,
}: {
  readonly permission: Permission;
  readonly onRequest: (permission: Permission) => void;
}) => {
  const t = useT();
  const isDialog = permission.kind === "dialog" && permission.state === "off";
  return (
    <Button
      onPress={() => {
        onRequest(permission);
      }}
      variant="secondary"
    >
      {t(isDialog ? "permissions.allow" : "permissions.openSettings")}
    </Button>
  );
};

/** One permission in Settings → Permissions: why, whether it is on, how to turn it on. */
export const PermissionCard = ({
  onRequest,
  permission,
}: {
  readonly permission: Permission;
  readonly onRequest: (permission: Permission) => void;
}) => {
  const t = useT();
  const isGuided = permission.restricted && permission.state === "off";
  return (
    <View
      accessibilityLabel={t(`permissions.${permission.id}`)}
      className="gap-2 border-t border-separator px-5 py-4"
      role="group"
    >
      <PermissionText id={permission.id} />
      <View className="flex-row items-center justify-between gap-3">
        <Text className={cx("font-sans text-footnote", STATE_CLASS[permission.state])}>
          {t(`permissions.${permission.state}`)}
        </Text>
        {isGuided || permission.state === "on" ? null : (
          <PermissionAction onRequest={onRequest} permission={permission} />
        )}
      </View>
      {isGuided ? (
        <UsageGuide
          onRequest={() => {
            onRequest(permission);
          }}
        />
      ) : null}
    </View>
  );
};
