import { describe, expect, it } from "vitest";

import { INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { accountTz } from "./context.ts";
import { artboardState, ctx, MOSCOW } from "./fixture.fake.ts";

describe("accountTz", () => {
  it("is the account time zone once it is set", () => {
    expect(accountTz(artboardState(), ctx(undefined, "Europe/Berlin"))).toBe(MOSCOW);
  });

  it("falls back to the device zone until the account has one", () => {
    expect(accountTz(INITIAL_CORE_STATE, ctx(undefined, "Europe/Berlin"))).toBe("Europe/Berlin");
  });
});
