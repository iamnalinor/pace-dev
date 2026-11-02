import { Image, Text, View } from "react-native";

import type { OAuthClientInfo } from "@pace/core";

import { useT } from "#app/app-state.tsx";

/**
Who is asking and where the access goes. Every string here came from the client (its
registration or metadata document); it is rendered as text, never as markup.
*/
export const ClientCard = ({ info }: { readonly info: OAuthClientInfo }) => {
  const t = useT();
  return (
    <View className="gap-3 rounded-lg border border-separator bg-fill-3 p-4">
      <View className="flex-row items-center gap-3">
        {info.logoUri === null ? null : (
          <Image
            accessibilityLabel={info.clientName}
            className="h-10 w-10 rounded-md bg-app"
            referrerPolicy="no-referrer"
            resizeMode="contain"
            source={{ uri: info.logoUri }}
          />
        )}
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-headline text-label-primary" numberOfLines={1}>
            {info.clientName}
          </Text>
          <Text className="font-sans text-caption font-normal text-label-tertiary">
            {info.clientDomain === null
              ? t("oauth.unverified")
              : t("oauth.publishedBy", { domain: info.clientDomain })}
          </Text>
        </View>
      </View>
      <Text className="font-sans text-subhead font-normal text-label-secondary">
        {t("oauth.redirectTo", { host: info.redirectHost })}
      </Text>
      {info.redirectIsLoopback ? (
        <Text className="font-sans text-subhead font-normal text-warn">
          {t("oauth.loopbackWarning")}
        </Text>
      ) : null}
    </View>
  );
};
