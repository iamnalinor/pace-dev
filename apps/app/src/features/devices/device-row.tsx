import { Laptop, Smartphone } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { type Device, formatDuration, minutesBetween } from "@pace/core";

/** "Last data 5m ago", "Last data just now" or "Nothing sent yet". */
const useActivityText = (lastActivityAt: null | string): string => {
  const t = useT();
  const { language, now } = useViewer();
  if (lastActivityAt === null) {
    return t("devices.nothingYet");
  }
  const minutes = Math.max(0, minutesBetween(lastActivityAt, now));
  return minutes < 1
    ? t("devices.justNow")
    : t("devices.lastActivity", { duration: formatDuration(minutes, language) });
};

/** One device: its kind, name and last data; a computer can be disconnected (asked first). */
export const DeviceRow = ({
  device,
  onDisconnect,
}: {
  readonly device: Device;
  readonly onDisconnect: () => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const { language } = useViewer();
  const activity = useActivityText(device.lastActivityAt);
  const [isConfirming, setIsConfirming] = useState(false);
  const Icon = device.kind === "computer" ? Laptop : Smartphone;
  const connected =
    device.connectedAt === null
      ? null
      : t("devices.connected", {
          date: new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
            new Date(device.connectedAt),
          ),
        });
  return (
    <View
      aria-label={device.name}
      className="gap-2 rounded-lg border border-line bg-raised p-3"
      role="group"
    >
      <View className="flex-row items-center gap-3">
        <Icon color={palette.fg2} size={20} />
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-[14px] font-medium text-fg" numberOfLines={1}>
            {device.name}
          </Text>
          <Text className="font-sans text-[12px] text-muted">
            {[
              t(device.kind === "computer" ? "devices.computer" : "devices.phone"),
              activity,
              connected,
            ]
              .filter((part) => part !== null)
              .join(" · ")}
          </Text>
        </View>
        {!isConfirming && device.kind === "computer" ? (
          <Button
            onPress={() => {
              setIsConfirming(true);
            }}
            variant="secondary"
          >
            {t("devices.disconnect")}
          </Button>
        ) : null}
      </View>
      {isConfirming ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="flex-1 font-sans text-[14px] text-fg">
            {t("devices.disconnectConfirm", { name: device.name })}
          </Text>
          <Button
            onPress={() => {
              setIsConfirming(false);
            }}
            variant="ghost"
          >
            {t("common.cancel")}
          </Button>
          <Button onPress={onDisconnect}>{t("devices.disconnect")}</Button>
        </View>
      ) : null}
    </View>
  );
};
