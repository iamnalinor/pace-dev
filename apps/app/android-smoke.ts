/** Android Emulator's alias for the host loopback. Web smoke builds use a different origin. */
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- Android smoke uses a local Worker, with cleartext scoped to this emulator host
export const ANDROID_SMOKE_API_URL = "http://10.0.2.2:8787";
