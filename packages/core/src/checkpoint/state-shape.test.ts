import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CoreStateSchema } from "./state-schema.ts";
import { CHECKPOINT_VERSION } from "./version.ts";

/**
A checkpoint's `state` is read by a strict schema, so its shape is part of `CHECKPOINT_VERSION`
(PR 55 review I4, bug-lessons 13 and 150). A device keeps a checkpoint the server made, and a
server keeps one an older build made: a field added to `CoreState` and to `CoreStateSchema` in
the same change type-checks (`satisfies z.ZodType<CoreState>`) and still makes every stored base
unreadable, on every device at once, with no version to tell the two shapes apart.

`frozen/core-state.v<N>.frozen.json` is the shape under version N: the JSON Schema of
`CoreStateSchema` with every leaf written out (payload schemas, the preset definition, the series
template), so a change in a shared leaf shows as well as a new field. This test fails when the
shape printed now differs from the one frozen for the current version.

When it fails: the shape changed. Raise `CHECKPOINT_VERSION` (`version.ts`) and run this test
once with `PACE_FREEZE_CHECKPOINT_SHAPE=1`; it writes the new version's file, which is committed
with the change. Without that variable a missing file fails the test and nothing is written: a run
in CI or on a checkout must never freeze a shape into the source tree by itself. A client that reads
the new number as unknown (`features.historyCheckpoint` is `null` to it) falls back to the legacy
pull and turns its checkpoint copy into a full one (`legacyPageChange`). Never edit a frozen file
and never re-freeze under the same number: builds with that number are in use.

What this cannot see: a reducer that fills the same shape differently. That is a version bump
too (`version.ts`), by review.

It depends on zod's JSON Schema output (`z.toJSONSchema`): the shape is compared as zod prints it.
A zod update that prints the same shape in other words fails this test with no change to what the
schema accepts. Then compare what the two schemas accept; if nothing changed, teach `ownWords` to
leave the library's new wording out. Do not edit the frozen file or raise the version for that.

Version 1 is the shape with `Subtask.doneAt` (one mark, the redesign of PR 54), not the earlier
`done` / `doneAt` pair. No bump was needed for that change: checkpoints first exist in the build
that carries this file. The server's mode has never been anything but `off` in production, so no
store holds a checkpoint, and no released client could ask for or persist one.
*/
const frozenFile = (version: number): URL =>
  new URL(`frozen/core-state.v${String(version)}.frozen.json`, import.meta.url);

/**
The schema's own words only: the dialect line and the regular expression zod prints next to a
named `format` are the library's, and may change with its version while the shape does not.
*/
const ownWords = (key: string, value: unknown): unknown => {
  if (key === "$schema") {
    return undefined;
  }
  if (typeof value === "object" && value !== null && "format" in value && "pattern" in value) {
    const { pattern: _pattern, ...rest } = value;
    return rest;
  }
  return value;
};

const shapeOf = (schema: z.ZodType): unknown =>
  // Through JSON, as the file is read: a key whose value is `undefined` is no key.
  JSON.parse(
    JSON.stringify(
      z.toJSONSchema(schema, { io: "input", reused: "inline", unrepresentable: "any" }),
      ownWords,
    ),
  );

const frozenShape = (version: number): unknown =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- this package's own frozen file, named by the version
  JSON.parse(readFileSync(frozenFile(version), "utf8"));

describe("the shape of a checkpoint's state", () => {
  it("is the one frozen for CHECKPOINT_VERSION: a changed shape needs a new version", () => {
    const file = frozenFile(CHECKPOINT_VERSION);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- this package's own frozen file, named by the version
    if (!existsSync(file)) {
      // A new version has no frozen shape yet: it is written once, on request, never overwritten.
      if (process.env["PACE_FREEZE_CHECKPOINT_SHAPE"] !== "1") {
        throw new Error(
          `No frozen state shape for version ${String(CHECKPOINT_VERSION)}: run this test once with PACE_FREEZE_CHECKPOINT_SHAPE=1 and commit ${file.pathname}`,
        );
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- this package's own frozen file, named by the version
      writeFileSync(file, `${JSON.stringify(shapeOf(CoreStateSchema), null, 2)}\n`);
      throw new Error(
        `Froze the state's shape for version ${String(CHECKPOINT_VERSION)}: commit ${file.pathname}`,
      );
    }
    expect(shapeOf(CoreStateSchema)).toEqual(frozenShape(CHECKPOINT_VERSION));
  });

  it("tells a new field, a removed field and a changed leaf from the frozen shape", () => {
    const frozen = frozenShape(CHECKPOINT_VERSION);
    const { series: _series, ...withoutSeries } = CoreStateSchema.shape;
    const language = z.enum(["en", "ru", "de"]);
    const changed = [
      CoreStateSchema.extend({ notes: z.array(z.string()) }),
      z.strictObject(withoutSeries),
      CoreStateSchema.extend({ settings: CoreStateSchema.shape.settings.extend({ language }) }),
    ];
    for (const schema of changed) {
      expect(shapeOf(schema)).not.toEqual(frozen);
    }
  });

  it("keeps the shape of every earlier version apart from the current one", () => {
    for (let version = 1; version < CHECKPOINT_VERSION; version++) {
      expect(frozenShape(version)).not.toEqual(frozenShape(CHECKPOINT_VERSION));
    }
  });
});
