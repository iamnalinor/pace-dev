import { Text, View } from "react-native";

import type { Permission } from "#app/platform/permissions.ts";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { inkClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";

/** What a permission is called and why Pace wants it. */
export const PermissionText = ({ id }: { readonly id: Permission["id"] }) => {
  const t = useT();
  return (
    <View className="gap-0.5">
      <Text className="font-sans text-[15px] font-medium text-fg">{t(`permissions.${id}`)}</Text>
      <Text className="font-sans text-[13px] text-fg2">{t(`permissions.${id}.why`)}</Text>
    </View>
  );
};

const STATE_CLASS: Readonly<Record<Permission["state"], string>> = {
  blocked: inkClass("coral"),
  off: "text-muted",
  on: inkClass("green"),
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
  return (
    <View
      accessibilityLabel={t(`permissions.${permission.id}`)}
      className="gap-2 border-t border-line px-5 py-4"
      role="group"
    >
      <PermissionText id={permission.id} />
      <View className="flex-row items-center justify-between gap-3">
        <Text className={cx("font-sans text-[13px]", STATE_CLASS[permission.state])}>
          {t(`permissions.${permission.state}`)}
        </Text>
        {permission.state === "on" ? null : (
          <PermissionAction onRequest={onRequest} permission={permission} />
        )}
      </View>
    </View>
  );
};
