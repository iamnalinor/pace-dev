/** What a pressable takes to answer Space (the web's; the phone has no such key). */
export type SpacePress = {
  readonly onKeyDown?: (event: {
    readonly currentTarget: unknown;
    readonly key?: string;
    readonly preventDefault: () => void;
    readonly repeat?: boolean;
    readonly target: unknown;
  }) => void;
};

/** The phone has no Space key to answer. */
export const spacePress = (
  _onPress: (() => void) | undefined,
  _isDisabled = false,
): SpacePress => ({});
