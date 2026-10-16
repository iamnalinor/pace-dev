import { useState } from "react";
import { Image, Text, View } from "react-native";

import { useAuth } from "#app/app-state.tsx";

/** Telegram photo cached at Pace, with the owner's initials when no photo is available. */
export const UserAvatar = ({ size = 44 }: { readonly size?: number }) => {
  const { user } = useAuth();
  const [failedUrl, setFailedUrl] = useState<null | string>(null);
  const photoUrl = user?.photoUrl ?? null;
  const initials = (user?.name ?? "")
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
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
      className="items-center justify-center rounded-full bg-accentQuiet"
      style={{ width: size, height: size }}
    >
      <Text
        className="font-sans font-semibold text-accentQuietFg"
        style={{ fontSize: size * 0.38 }}
      >
        {initials}
      </Text>
    </View>
  );
};
