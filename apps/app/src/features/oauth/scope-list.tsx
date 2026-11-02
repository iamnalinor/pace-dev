import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { OAuthScope } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { SCOPE_KEYS } from "@pace/client";

/** The requested scopes as plain-language checkboxes, all ticked until the person unticks one. */
export const ScopeList = ({
  chosen,
  offered,
  onToggle,
}: {
  readonly offered: readonly OAuthScope[];
  readonly chosen: readonly OAuthScope[];
  readonly onToggle: (scope: OAuthScope) => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  return (
    <View accessibilityLabel={t("oauth.scopesTitle")} className="gap-2" role="group">
      <Text className="mb-1 font-sans text-caption2 font-normal uppercase tabular-nums text-label-tertiary">
        {t("oauth.scopesTitle")}
      </Text>
      {offered.map((scope) => {
        const isChecked = chosen.includes(scope);
        return (
          <Pressable
            accessibilityRole="checkbox"
            aria-checked={isChecked}
            className="min-h-hit-web flex-row items-center gap-3 rounded-md border border-outline px-3 py-2"
            key={scope}
            onPress={() => {
              onToggle(scope);
            }}
          >
            <View
              className={cx(
                "h-5 w-5 items-center justify-center rounded-xs border-stroke",
                isChecked ? "border-accent bg-accent-quiet" : "border-outline",
              )}
            >
              {isChecked ? (
                <Check color={palette["accent.text"]} size={12} strokeWidth={3} />
              ) : null}
            </View>
            <Text className="flex-1 font-sans text-subhead font-normal text-label-primary">
              {t(SCOPE_KEYS[scope])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
