import { describe, expect, it } from "vitest";

import { createSession } from "./auth-session.ts";
import { fakeUser } from "./fake-fetch.fake.ts";
import { createMemorySessionStore } from "./session.ts";

describe("session persistence ownership", () => {
  it.each(["signIn", "adopt"] as const)(
    "drains a deferred %s save before handoff clear and never publishes it",
    async (method) => {
      const memory = createMemorySessionStore();
      const saving = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const session = createSession(
        {
          ...memory,
          set: async (token) => {
            saving.resolve(undefined);
            await release.promise;
            await memory.set(token);
          },
        },
        undefined,
      );
      await session.ready;
      const written =
        method === "signIn"
          ? session.signIn({ token: "old", user: fakeUser })
          : session.adopt("old");
      await saving.promise;
      const suspended = session.suspendSignIn();
      expect(session.token()).toBeUndefined();
      release.resolve(undefined);
      await expect(written).resolves.toEqual({ ok: false, error: "session/changed" });
      await suspended;
      await expect(memory.get()).resolves.toBeNull();
      expect(session.store.getState().status).toBe("signed-out");
      session.resumeSignIn();
      await expect(session.signIn({ token: "new", user: fakeUser })).resolves.toEqual({
        ok: true,
        value: fakeUser,
      });
      await expect(memory.get()).resolves.toBe("new");
    },
  );
  it("does not swallow a failed handoff clear and can resume only explicitly", async () => {
    const memory = createMemorySessionStore();
    const session = createSession(
      {
        ...memory,
        clear: async () => {
          throw new Error("disk");
        },
      },
      undefined,
    );
    await session.ready;
    await expect(session.suspendSignIn()).rejects.toThrow("disk");
    await expect(session.signIn({ token: "old", user: fakeUser })).resolves.toEqual({
      ok: false,
      error: "session/changed",
    });
    session.resumeSignIn();
    await expect(session.signIn({ token: "new", user: fakeUser })).resolves.toEqual({
      ok: true,
      value: fakeUser,
    });
  });
  it("drains a failed save and still completes the queued handoff clear", async () => {
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const memory = createMemorySessionStore();
    const session = createSession(
      {
        ...memory,
        set: async () => {
          entered.resolve(undefined);
          await release.promise;
          throw new Error("write");
        },
      },
      undefined,
    );
    await session.ready;
    const save = session.adopt("old");
    await entered.promise;
    const suspended = session.suspendSignIn();
    release.resolve(undefined);
    await expect(save).rejects.toThrow("write");
    await suspended;
    await expect(memory.get()).resolves.toBeNull();
    expect(session.store.getState().status).toBe("signed-out");
  });
  it("does not leave a deferred login token in storage after ordinary logout", async () => {
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const memory = createMemorySessionStore();
    const session = createSession(
      {
        ...memory,
        set: async (token) => {
          entered.resolve(undefined);
          await release.promise;
          await memory.set(token);
        },
      },
      undefined,
    );
    await session.ready;
    const saving = session.adopt("old");
    await entered.promise;
    const loggingOut = session.signOut();
    release.resolve(undefined);
    await expect(saving).resolves.toEqual({ ok: false, error: "session/changed" });
    await loggingOut;
    await expect(memory.get()).resolves.toBeNull();
    expect(session.store.getState().status).toBe("signed-out");
  });
});
