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
      <Text className="mb-1 font-sans text-[11px] uppercase tabular-nums tracking-[0.06em] text-muted">
        {t("oauth.scopesTitle")}
      </Text>
      {offered.map((scope) => {
        const isChecked = chosen.includes(scope);
        return (
          <Pressable
            accessibilityRole="checkbox"
            aria-checked={isChecked}
            className="min-h-11 flex-row items-center gap-3 rounded-md border border-line px-3 py-2"
            key={scope}
            onPress={() => {
              onToggle(scope);
            }}
          >
            <View
              className={cx(
                "h-[18px] w-[18px] items-center justify-center rounded border-[1.5px]",
                isChecked ? "border-accent bg-accent" : "border-muted",
              )}
            >
              {isChecked ? <Check color={palette.accentFg} size={12} strokeWidth={3} /> : null}
            </View>
            <Text className="flex-1 font-sans text-[14px] text-fg">{t(SCOPE_KEYS[scope])}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};
