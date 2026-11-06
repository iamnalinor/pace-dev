import { applyInstanceCheck, serverStore } from "./server-store.ts";

const origin = "https://pace.example.org";

beforeEach(() => {
  serverStore.setState({
    origin,
    instance: null,
    status: "unknown",
    reason: null,
    configurationError: null,
  });
});

it("keeps a configuration failure separate from version incompatibility", () => {
  applyInstanceCheck(origin, {
    ok: false,
    error: { kind: "server-misconfigured", reason: "project-mismatch" },
  });
  expect(serverStore.getState()).toMatchObject({
    origin,
    status: "unknown",
    reason: null,
    configurationError: { reason: "project-mismatch" },
  });
});

it("does not let an old server's configuration failure overwrite the current server", () => {
  applyInstanceCheck("https://old.example.org", {
    ok: false,
    error: { kind: "server-misconfigured", reason: null },
  });
  expect(serverStore.getState().configurationError).toBeNull();
});

it("clears the configuration failure when the same server recovers", () => {
  applyInstanceCheck(origin, { ok: false, error: { kind: "server-misconfigured", reason: null } });
  expect(serverStore.getState().configurationError).toEqual({ reason: null });
  applyInstanceCheck(origin, {
    ok: true,
    value: {
      apiOrigin: origin,
      botUsername: "PaceBot",
      features: { assistant: false, historyCheckpoint: null, mcp: false, push: false },
      firebase: null,
      loginMethods: ["telegram-deeplink"],
      minClientProtocol: 1,
      name: "Pace",
      protocol: 1,
      version: "test",
      webOrigin: origin,
    },
  });
  expect(serverStore.getState()).toMatchObject({
    configurationError: null,
    status: "ok",
    reason: null,
  });
});

it("replaces a stale version mismatch with the configuration failure", () => {
  serverStore.setState({ status: "incompatible", reason: "client-outdated" });
  applyInstanceCheck(origin, { ok: false, error: { kind: "server-misconfigured", reason: null } });
  expect(serverStore.getState()).toMatchObject({
    status: "unknown",
    reason: null,
    configurationError: { reason: null },
  });
});

it("clears a stale configuration problem when a new check establishes a version mismatch", () => {
  applyInstanceCheck(origin, { ok: false, error: { kind: "server-misconfigured", reason: null } });
  applyInstanceCheck(origin, { ok: false, error: "client-outdated" });
  expect(serverStore.getState()).toMatchObject({
    status: "incompatible",
    reason: "client-outdated",
    configurationError: null,
  });
});
