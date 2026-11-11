import { config } from "zod";

import "./content-policy.ts";

describe("the app under the production CSP (no 'unsafe-eval')", () => {
  it("never lets zod probe for eval: the probe is a policy violation on every load", () => {
    expect(config().jitless).toBe(true);
  });
});
