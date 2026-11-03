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

/** The URL to copy, the line about another address, and each client's steps. */
const ConnectSteps = ({
  isPublicOriginOther,
  url,
  usedOrigin,
}: {
  readonly isPublicOriginOther: boolean;
  readonly url: string;
  readonly usedOrigin: string;
}) => {
  const t = useT();
  const [isCopied, setIsCopied] = useState(false);
  return (
    <>
      <Text className="font-sans text-subhead font-normal text-label-primary">
        {t("connectAi.intro")}
      </Text>
      <View className="gap-2">
        <Text className="font-sans text-caption2 font-normal uppercase text-label-tertiary">
          {t("connectAi.url")}
        </Text>
        <CodeText>{url}</CodeText>
        {isPublicOriginOther ? (
          // An instruction about the address above, so a meta line, not the quietest tier.
          <Text className="font-sans text-caption font-normal text-label-secondary">
            {t("connectAi.otherAddress", { used: usedOrigin })}
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
    </>
  );
};

/**
"Connect an AI app": the current server's MCP URL (its own public API, not the build's nor
the address this device reaches it at, when those differ: said in a line) to copy, and
where Claude, ChatGPT and any other MCP client with OAuth take it. The app then signs in on
Pace's consent page and shows up in Devices and sessions. A server without MCP says so instead.
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
  const { apiOrigin: usedOrigin, isPublicOriginOther, mcpUrl: url } = useServerInfo();
  return (
    <Sheet
      closeLabel={t("common.close")}
      name="connect-ai"
      onClose={onClose}
      open={open}
      title={t("connectAi.open")}
    >
      {url === null ? (
        // The server has no MCP (no https origin, re-review N4): no URL that answers 503.
        <Text className="font-sans text-subhead font-normal text-label-primary">
          {t("connectAi.unavailable")}
        </Text>
      ) : (
        <ConnectSteps isPublicOriginOther={isPublicOriginOther} url={url} usedOrigin={usedOrigin} />
      )}
    </Sheet>
  );
};
