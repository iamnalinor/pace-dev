import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { ReleaseStore } from "../src/shared/store-types.ts";

import { createReleaseStore } from "../src/r2-store.ts";
import { promoteRelease } from "../src/shared/publish-promote.ts";
import { stageRelease } from "../src/shared/publish-stage.ts";
import { readChannel } from "../src/shared/release-read.ts";
import { stagingFixture } from "./release.fixture.ts";

/** The R2 store, with the keys it was asked to write. */
const recordingStore = (): { readonly store: ReleaseStore; readonly writes: string[] } => {
  const store = createReleaseStore(env.UPDATES);
  const writes: string[] = [];
  return {
    writes,
    store: {
      ...store,
      putIfAbsent: async (input) => {
        writes.push(input.key);
        return await store.putIfAbsent(input);
      },
      compareAndSwap: async (input) => {
        writes.push(input.key);
        return await store.compareAndSwap(input);
      },
    },
  };
};

describe("publisher signature", () => {
  it("refuses to stage a release signed by a key other than the pinned one, writing nothing", async () => {
    const input = await stagingFixture("11111111-1234-4234-8234-123456789abc");
    const other = await stagingFixture("11111111-1234-4234-8234-123456789abc");
    const { store, writes } = recordingStore();
    expect(await stageRelease({ ...input, publisherKey: other.publisherKey }, store)).toEqual({
      ok: false,
      error: "signature-invalid",
    });
    expect(writes).toEqual([]);
  });

  it("refuses to stage a well-formed but garbage signature", async () => {
    const input = await stagingFixture("22222222-1234-4234-8234-123456789abc");
    const garbage = btoa("not a signature of these bytes");
    const signed = {
      ...input.signed,
      signature: garbage,
      signatureHeader: `sig="${garbage}", keyid="root", alg="rsa-v1_5-sha256"`,
    };
    const { store, writes } = recordingStore();
    expect(await stageRelease({ ...input, signed }, store)).toEqual({
      ok: false,
      error: "signature-invalid",
    });
    expect(writes).toEqual([]);
  });

  it("verifies the stored manifest against the pinned key again before the channel swap", async () => {
    const input = await stagingFixture("33333333-1234-4234-8234-123456789abc");
    const other = await stagingFixture("33333333-1234-4234-8234-123456789abc");
    const { store } = recordingStore();
    const staged = await stageRelease(input, store);
    if (!staged.ok) {
      throw new Error(staged.error);
    }
    const release = { ...staged.value, publisherKey: other.publisherKey };
    expect(await promoteRelease({ release, channel: "signed", expectedEtag: null }, store)).toEqual(
      { ok: false, error: "signature-invalid" },
    );
    expect(
      await readChannel({ runtimeVersion: "published-runtime", channel: "signed" }, store),
    ).toEqual({ ok: true, value: null });
    expect(
      (
        await promoteRelease(
          { release: staged.value, channel: "signed", expectedEtag: null },
          store,
        )
      ).ok,
    ).toBe(true);
  });
});
