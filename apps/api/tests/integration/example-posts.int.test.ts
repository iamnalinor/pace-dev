import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { EXAMPLE_POST_MAX_LENGTH } from "../../src/features/example-posts/domain/example-post.ts";
import { startTestApp, type TestApp } from "./test-app.ts";

// A frozen clock: several posts share the exact same createdAt, the worst case
// for keyset pagination (ties must be broken by id without gaps or duplicates).
const byId = (a: string, b: string): number => a.localeCompare(b);

const FROZEN_NOW = new Date("2026-01-01T00:00:00.000Z");

describe("example posts", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp({ clock: { now: () => FROZEN_NOW } });
  });
  beforeEach(async () => {
    await app.truncate();
  });
  afterAll(async () => {
    await app.stop();
  });

  describe("create", () => {
    test("returns the created post with author and zero likes", async () => {
      const alice = await app.signUp("Alice");

      const { data, status } = await alice.api["example-posts"].post({ body: "  Hello!  " });

      expect(status).toBe(201);
      expect(data).toEqual({
        author: { id: alice.id, name: "Alice" },
        body: "Hello!",
        createdAt: FROZEN_NOW.toISOString(),
        id: expect.any(String) as string,
        likeCount: 0,
        likedByMe: false,
      });
    });

    test.each([
      ["whitespace only", " \n ", "example-post/empty"],
      ["one code point too long", "a".repeat(EXAMPLE_POST_MAX_LENGTH + 1), "example-post/too-long"],
    ])("rejects a %s body with 422", async (_name, body, code) => {
      const alice = await app.signUp("Alice");

      const { error } = await alice.api["example-posts"].post({ body });

      expect(error?.status).toBe(422);
      expect(error?.value).toMatchObject({ code });
    });

    test("a body that looks like a date stays a string (Eden parseDate: false)", async () => {
      const alice = await app.signUp("Alice");

      const { data } = await alice.api["example-posts"].post({ body: "2026-01-01T00:00:00Z" });

      expect(data?.body).toBe("2026-01-01T00:00:00Z");
    });

    test("accepts emoji up to the limit: the DB constraint agrees with the domain", async () => {
      const alice = await app.signUp("Alice");

      const { status } = await alice.api["example-posts"].post({
        body: "😀".repeat(EXAMPLE_POST_MAX_LENGTH),
      });

      expect(status).toBe(201);
    });
  });

  describe("feed", () => {
    test("pages through posts with identical timestamps without gaps or duplicates", async () => {
      const alice = await app.signUp("Alice");
      const created = await Promise.all(
        Array.from({ length: 7 }, async (_, index) => {
          const { data } = await alice.api["example-posts"].post({ body: `post ${index}` });
          return data?.id ?? "";
        }),
      );

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        // exactOptionalPropertyTypes: omit the key instead of passing `cursor: undefined`.
        const query = cursor === undefined ? { limit: 3 } : { cursor, limit: 3 };
        const { data } = await alice.api["example-posts"].get({ query });
        seen.push(...(data?.items.map((item) => item.id) ?? []));
        cursor = data?.nextCursor ?? undefined;
      } while (cursor !== undefined);

      expect(seen).toHaveLength(7);
      expect(seen.toSorted(byId)).toEqual(created.toSorted(byId));
    });

    test("likedByMe is per viewer, likeCount is global", async () => {
      const alice = await app.signUp("Alice");
      const bob = await app.signUp("Bob");
      const { data: post } = await alice.api["example-posts"].post({ body: "like me" });
      await bob.api["example-posts"]({ id: post?.id ?? "" }).like.put();

      const aliceView = await alice.api["example-posts"].get({ query: {} });
      const bobView = await bob.api["example-posts"].get({ query: {} });

      expect(aliceView.data?.items[0]).toMatchObject({ likeCount: 1, likedByMe: false });
      expect(bobView.data?.items[0]).toMatchObject({ likeCount: 1, likedByMe: true });
    });

    test("rejects a tampered cursor with 400 instead of restarting from the top", async () => {
      const alice = await app.signUp("Alice");

      const { error } = await alice.api["example-posts"].get({ query: { cursor: "tampered" } });

      expect(error?.status).toBe(400);
    });

    test("rejects an out-of-range limit", async () => {
      const alice = await app.signUp("Alice");

      const { error } = await alice.api["example-posts"].get({ query: { limit: 1000 } });

      expect(error?.status).toBe(422);
      // Same { code, message } shape as domain errors (normalized in app.ts).
      expect(error?.value).toEqual({ code: "validation", message: expect.any(String) as string });
    });
  });

  describe("likes", () => {
    test("are idempotent and survive concurrent requests", async () => {
      const alice = await app.signUp("Alice");
      const { data: post } = await alice.api["example-posts"].post({ body: "race" });
      const like = alice.api["example-posts"]({ id: post?.id ?? "" }).like;

      const results = await Promise.all(Array.from({ length: 10 }, async () => await like.put()));

      expect(results.map((result) => result.status)).toEqual(Array.from({ length: 10 }, () => 200));
      expect((await like.put()).data).toEqual({ likeCount: 1, likedByMe: true });
      expect((await like.delete()).data).toEqual({ likeCount: 0, likedByMe: false });
      expect((await like.delete()).data).toEqual({ likeCount: 0, likedByMe: false });
    });

    test("on a missing post return 404; a malformed id is a validation error", async () => {
      const alice = await app.signUp("Alice");

      const missing = await alice.api["example-posts"]({ id: crypto.randomUUID() }).like.put();
      const malformed = await alice.api["example-posts"]({ id: "not-a-uuid" }).like.put();

      expect(missing.error?.status).toBe(404);
      expect(malformed.error?.status).toBe(422);
    });
  });

  describe("delete", () => {
    test("only the author can delete; likes are removed with the post", async () => {
      const alice = await app.signUp("Alice");
      const bob = await app.signUp("Bob");
      const { data: post } = await alice.api["example-posts"].post({ body: "mine" });
      const target = (user: typeof alice) => user.api["example-posts"]({ id: post?.id ?? "" });
      await target(bob).like.put();

      expect((await target(bob).delete()).error?.status).toBe(403);
      expect((await target(alice).delete()).status).toBe(204);
      expect((await target(alice).delete()).error?.status).toBe(404);
      expect((await target(bob).like.put()).error?.status).toBe(404);
      expect((await alice.api["example-posts"].get({ query: {} })).data?.items).toEqual([]);
    });
  });
});
