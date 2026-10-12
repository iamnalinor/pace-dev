import { describe, expect, it } from "vitest";

import { bridgeCommand } from "./devices.ts";

describe("the command that connects a computer", () => {
  it("downloads the bridge from the web app and installs it with the device's token", () => {
    expect(
      bridgeCommand({
        apiBase: "https://api.pace.test",
        device: { id: "01DEV", name: "Mint's laptop", token: "tok_123" },
        webOrigin: "https://pace.test",
      }),
    ).toBe(
      String.raw`mkdir -p ~/.local/share/pace && curl -fsSL https://pace.test/pace_aw_bridge.py -o ~/.local/share/pace/pace_aw_bridge.py && python3 ~/.local/share/pace/pace_aw_bridge.py install --server https://api.pace.test --token tok_123 --device-id 01DEV --name 'Mint'\''s laptop'`,
    );
  });
});
