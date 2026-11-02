import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useStore } from "zustand";

import { usePace, useT } from "#app/app-state.tsx";
import { isBuildServer, serverStore } from "#app/platform/server-store.ts";
import { switchServer } from "#app/platform/server.ts";
import { Button } from "#app/ui/button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { checkInstance, type InstanceError } from "@pace/client";
import {
  type Instance,
  type MessageKey,
  normalizeServerUrl,
  type ServerUrlError,
} from "@pace/core";

type Problem = InstanceError | ServerUrlError;

type Phase =
  | { readonly kind: "checking" }
  | { readonly kind: "found"; readonly origin: string; readonly instance: Instance }
  | { readonly kind: "idle" }
  | { readonly kind: "refused"; readonly problem: Problem };

const PROBLEM_KEY: Readonly<Record<Problem, MessageKey>> = {
  "client-outdated": "server.clientOutdated",
  insecure: "server.insecure",
  "invalid-url": "server.invalidUrl",
  "not-pace": "server.notPace",
  "server-outdated": "server.serverOutdated",
  unreachable: "server.unreachable",
};

/** One fact about the checked server: a quiet label and the server's own value, read as one. */
const Fact = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <View
    accessibilityLabel={`${label}: ${value}`}
    accessible
    className="flex-row items-baseline justify-between gap-3 py-2"
  >
    <Text className="font-sans text-footnote text-label-secondary">{label}</Text>
    <Text className="shrink text-right font-sans text-callout text-label-primary" selectable>
      {value}
    </Text>
  </View>
);

/** What the checked server says it is, before the person moves the app to it. */
const Found = ({ instance }: { readonly instance: Instance }) => {
  const t = useT();
  return (
    <View className="rounded-lg border border-separator bg-fill-3 px-3 py-1">
      <Fact label={t("server.name")} value={instance.name} />
      <Fact label={t("server.version")} value={instance.version} />
      <Fact label={t("server.bot")} value={`@${instance.botUsername}`} />
    </View>
  );
};

/** The typed address, checked on demand: refused with a reason, or found with what it is. */
const useServerCheck = () => {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Which check may still answer: an edit (or a newer check) makes a slower answer stale.
  const latestCheckRef = useRef(0);
  const check = async (): Promise<void> => {
    latestCheckRef.current += 1;
    const asked = latestCheckRef.current;
    const url = normalizeServerUrl(text);
    if (!url.ok) {
      setPhase({ kind: "refused", problem: url.error });
      return;
    }
    setPhase({ kind: "checking" });
    const result = await checkInstance(url.value);
    if (asked !== latestCheckRef.current) {
      return;
    }
    setPhase(
      result.ok
        ? { instance: result.value, kind: "found", origin: url.value }
        : { kind: "refused", problem: result.error },
    );
  };
  // Another address must be checked again before it can be used.
  const edit = (next: string): void => {
    latestCheckRef.current += 1;
    setText(next);
    setPhase({ kind: "idle" });
  };
  return { check, edit, phase, text };
};

/**
"Change server" (signed out, from the login screen): the address of another Pace server, checked
against `/api/instance` (it must be a Pace this app fits) before the app moves to it; or back to
the build's own server. Moving drops this phone's local log and any stored token.
*/
export const ChangeServerSheet = ({ onClose }: { readonly onClose: () => void }) => {
  const t = useT();
  const runtime = usePace();
  const origin = useStore(serverStore, (state) => state.origin);
  const { check, edit, phase, text } = useServerCheck();
  const [isMoving, setIsMoving] = useState(false);
  // A latch read synchronously: two taps in one frame both see the state still false.
  const movingRef = useRef(false);

  const move = async (choice: Parameters<typeof switchServer>[1]): Promise<void> => {
    // One move per press: a second tap while the log is cleared would switch twice.
    if (movingRef.current) {
      return;
    }
    movingRef.current = true;
    setIsMoving(true);
    await switchServer(runtime, choice);
    onClose();
  };

  return (
    <Sheet
      closeLabel={t("common.close")}
      formLabel={t("server.title")}
      onClose={onClose}
      subtitle={t("server.subtitle")}
      title={t("server.title")}
      visible
    >
      <View className="gap-3">
        <TextField
          autoCapitalize="none"
          autoComplete="url"
          autoCorrect={false}
          error={phase.kind === "refused" ? t(PROBLEM_KEY[phase.problem]) : null}
          inputMode="url"
          keyboardType="url"
          label={t("server.address")}
          onChangeText={edit}
          onSubmitEditing={() => void check()}
          placeholder={t("server.placeholder")}
          returnKeyType="go"
          value={text}
        />
        {phase.kind === "found" ? (
          <>
            <Found instance={phase.instance} />
            <Button busy={isMoving} onPress={() => void move(phase)}>
              {t("server.use")}
            </Button>
          </>
        ) : (
          <Button
            busy={phase.kind === "checking"}
            disabled={text.trim() === ""}
            onPress={() => void check()}
          >
            {t("server.check")}
          </Button>
        )}
        {isBuildServer(origin) ? null : (
          <Button disabled={isMoving} onPress={() => void move(null)} variant="ghost">
            {t("server.reset")}
          </Button>
        )}
      </View>
    </Sheet>
  );
};
