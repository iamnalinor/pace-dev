import { useState } from "react";
import { Image, Text, View } from "react-native";

import { useAuth, useLanguage } from "#app/app-state.tsx";
import { Icon, type IconSize } from "#app/ui/icon.tsx";
import { initials } from "@pace/core";

/** Telegram photo cached at Pace, with the owner's initials (the person icon when the name has none) when no photo is available. */
/** From this size (the default 44) the person glyph is a control icon; smaller, an inline one. */
const LARGE_AVATAR = 32;

const glyphSize = (avatar: number): IconSize => (avatar >= LARGE_AVATAR ? "control" : "inline");

export const UserAvatar = ({ size = 44 }: { readonly size?: number }) => {
  const { user } = useAuth();
  const language = useLanguage();
  const [failedUrl, setFailedUrl] = useState<null | string>(null);
  const photoUrl = user?.photoUrl ?? null;
  const letters = initials(user?.name ?? "", language);
  return photoUrl !== null && failedUrl !== photoUrl ? (
    <Image
      accessibilityLabel={user?.name}
      onError={() => {
        setFailedUrl(photoUrl);
      }}
      source={{ uri: photoUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      className="items-center justify-center rounded-pill bg-accent-quiet"
      style={{ width: size, height: size }}
    >
      {letters === "" ? (
        <View testID="avatar-person">
          <Icon name="user" size={glyphSize(size)} tone="accent" />
        </View>
      ) : (
        <Text
          className="font-sans font-semibold text-accent-text"
          style={{ fontSize: size * 0.38 }}
        >
          {letters}
        </Text>
      )}
    </View>
  );
};
