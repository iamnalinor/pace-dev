import { useState } from "react";
import { Image, View } from "react-native";

import { useAuth, useLanguage } from "#app/app-state.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { Text } from "#app/ui/text.tsx";
import { initials } from "@pace/core";

/** The two sizes (spec §4.3.3): 24 (`icon.bar`) in chrome, 40 (`space.9`) beside a row's name. */
export type AvatarSize = 24 | 40;

/** The circle at its size: the classes spelled out, so Tailwind finds them. */
const CIRCLE: Readonly<Record<AvatarSize, string>> = { 24: "h-6 w-6", 40: "h-10 w-10" };

/** The face without a photo: the initials, or the person icon when the name has no letter. */
const Initials = ({ letters, size }: { readonly letters: string; readonly size: AvatarSize }) =>
  letters === "" ? (
    <View testID="avatar-person">
      <Icon name="user" size={size === 40 ? "control" : "inline"} />
    </View>
  ) : (
    <Text role={size === 40 ? "subhead" : "caption2"} tone="secondary">
      {letters}
    </Text>
  );

/**
The owner's Telegram photo cached at Pace (spec §4.3.3), on a `fill.3` circle that holds its
place while it loads (no shift); without a photo, the initials (graphemes, letters only; core's
`initials`) in `label.secondary`, `caption2` at 24 (the 11 px floor) and `subhead` at 40, or the
person icon when the name has no letter. Beside the visible name it is decorative: hidden from
screen readers, which read the name itself.
*/
export const UserAvatar = ({ size = 40 }: { readonly size?: AvatarSize }) => {
  const { user } = useAuth();
  const language = useLanguage();
  const [failedUrl, setFailedUrl] = useState<null | string>(null);
  const photoUrl = user?.photoUrl ?? null;
  return (
    <View
      accessibilityElementsHidden
      aria-hidden
      className={`${CIRCLE[size]} items-center justify-center overflow-hidden rounded-pill bg-fill-3`}
      importantForAccessibility="no-hide-descendants"
      testID="user-avatar"
    >
      {photoUrl === null || failedUrl === photoUrl ? (
        <Initials letters={initials(user?.name ?? "", language)} size={size} />
      ) : (
        <Image
          className={CIRCLE[size]}
          onError={() => {
            setFailedUrl(photoUrl);
          }}
          source={{ uri: photoUrl }}
        />
      )}
    </View>
  );
};
