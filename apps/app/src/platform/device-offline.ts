/**
Whether the device itself says it has no network. The app has no such signal (no NetInfo): a
return to the foreground syncs, and a failed sync shows the offline line.
*/
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the same hook as the web's, which does call hooks
export const useIsDeviceOffline = (_onBackOnline: () => void): boolean => false;
