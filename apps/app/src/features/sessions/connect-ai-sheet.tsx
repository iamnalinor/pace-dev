import { useState } from "react";
import { Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { useServerInfo } from "#app/platform/server-store.ts";
import { SHARE_URL_LABEL_KEY, shareText } from "#app/platform/share-text.ts";
import { Button } from "#app/ui/button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";

import { CodeText } from "./code-text.tsx";

/** The clients the steps name, each with where its setting is (from docs/mcp.md). */
const CLIENTS: readonly { readonly name: MessageKey; readonly steps: MessageKey }[] = [
  { name: "connectAi.claude", steps: "connectAi.claudeSteps" },
  { name: "connectAi.chatgpt", steps: "connectAi.chatgptSteps" },
  { name: "connectAi.other", steps: "connectAi.otherSteps" },
];

/**
"Connect an AI app": the current server's MCP URL (its own public API, not the build's nor
the address this device reaches it at, when those differ: said in a line) to copy, and
where Claude, ChatGPT and any other MCP client with OAuth take it. The app then signs in on
Pace's consent page and shows up in Devices and sessions.
*/
export const ConnectAiSheet = ({
  onClose,
  open,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) => {
  const t = useT();
  // The server's public API, its OAuth resource (round 7 review 1), not the address in use.
  const { isPublicOriginOther, mcpUrl: url } = useServerInfo();
  const [isCopied, setIsCopied] = useState(false);
  return (
    <Sheet
      closeLabel={t("common.close")}
      name="connect-ai"
      onClose={onClose}
      title={t("connectAi.open")}
      visible={open}
    >
      <Text className="font-sans text-[14px] leading-[20px] text-fg">{t("connectAi.intro")}</Text>
      <View className="gap-2">
        <Text className="font-sans text-[11px] uppercase tracking-[0.06em] text-muted">
          {t("connectAi.url")}
        </Text>
        <CodeText>{url}</CodeText>
        {isPublicOriginOther ? (
          <Text className="font-sans text-[12px] leading-[17px] text-muted">
            {t("connectAi.otherAddress")}
          </Text>
        ) : null}
        <Button
          onPress={() => {
            void (async () => {
              setIsCopied((await shareText(url)) === "done");
            })();
          }}
          variant="secondary"
        >
          {t(
            isCopied && SHARE_URL_LABEL_KEY === "connectAi.copy"
              ? "connectAi.copied"
              : SHARE_URL_LABEL_KEY,
          )}
        </Button>
      </View>
      {CLIENTS.map((client) => (
        <View className="gap-1" key={client.name}>
          <Text accessibilityRole="header" className="font-sans text-[15px] font-semibold text-fg">
            {t(client.name)}
          </Text>
          <Text className="font-sans text-[14px] leading-[20px] text-fg2">{t(client.steps)}</Text>
        </View>
      ))}
      <Text className="font-sans text-[12px] leading-[17px] text-muted">
        {t("connectAi.revokeHint")}
      </Text>
    </Sheet>
  );
};
