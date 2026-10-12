import { type CrashContextInput, crashContextOf, maskRoute } from "./crash-context.ts";

const input = (overrides: Partial<CrashContextInput> = {}): CrashContextInput => ({
  engine: "hermes",
  language: "ru",
  liveConnected: true,
  reactNative: "0.86.3",
  route: "/task/01JABCDEFGHJKMNPQRSTVWXYZ0",
  signedIn: true,
  sync: {
    lastError: null,
    lastSyncAt: "2026-10-12T16:00:00.000Z",
    online: true,
    syncing: false,
  },
  theme: "dark",
  window: { fontScale: 1.15, height: 915, width: 412 },
  ...overrides,
});

describe("maskRoute", () => {
  it("keeps route names and hides what identifies a record", () => {
    expect(maskRoute("/task/01JABCDEFGHJKMNPQRSTVWXYZ0")).toBe("/task/:id");
    expect(maskRoute("/project/hw:preset-1:2026-W41")).toBe("/project/:id");
    expect(maskRoute("/(tabs)/settings")).toBe("/(tabs)/settings");
    expect(maskRoute("/presets/new-activity")).toBe("/presets/new-activity");
  });
});

describe("crashContextOf", () => {
  it("tells what helps a fix: screen, session, sync, engine, window", () => {
    const text = crashContextOf(input());
    for (const line of [
      "screen: /task/:id",
      "signed in: yes",
      "language: ru · theme: dark",
      "sync: online, idle, last 2026-10-12T16:00:00.000Z, no error · live channel: up",
      "React Native 0.86.3 · hermes",
      "window: 412×915 dp, font scale 1.15",
    ]) {
      expect(text).toContain(line);
    }
  });

  it("keeps an error text short and never the record ids of a push", () => {
    const text = crashContextOf(
      input({
        sync: {
          lastError: `push rejected: 01JABCDEFGHJKMNPQRSTVWXYZ0, ${"x".repeat(300)}`,
          lastSyncAt: null,
          online: false,
          syncing: true,
        },
      }),
    );
    expect(text).toContain("sync: offline, syncing, never synced, error: push rejected: :id, xxx");
    expect(text).not.toContain("01JABCDEFGHJKMNPQRSTVWXYZ0");
    expect(text.length).toBeLessThan(600);
  });
});
