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
"Connect an AI app": the current server's MCP URL (its own API, not the build's) to copy, and
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
  const { apiOrigin } = useServerInfo();
  const url = `${apiOrigin}/mcp`;
  const [isCopied, setIsCopied] = useState(false);
  return (
    <Sheet
      closeLabel={t("common.close")}
      onClose={onClose}
      title={t("connectAi.open")}
      visible={open}
    >
      <Text className="font-sans text-subhead font-normal text-label-primary">
        {t("connectAi.intro")}
      </Text>
      <View className="gap-2">
        <Text className="font-sans text-caption2 font-normal uppercase text-label-tertiary">
          {t("connectAi.url")}
        </Text>
        <CodeText>{url}</CodeText>
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
          <Text
            accessibilityRole="header"
            className="font-sans text-callout font-semibold text-label-primary"
          >
            {t(client.name)}
          </Text>
          <Text className="font-sans text-subhead font-normal text-label-secondary">
            {t(client.steps)}
          </Text>
        </View>
      ))}
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("connectAi.revokeHint")}
      </Text>
    </Sheet>
  );
};
