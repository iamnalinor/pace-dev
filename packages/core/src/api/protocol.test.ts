import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { compatibility, MIN_CLIENT_PROTOCOL, MIN_SERVER_PROTOCOL, PROTOCOL } from "./protocol.ts";

describe("compatibility", () => {
  it("lets today's app and today's server work together", () => {
    expect(compatibility({ minClientProtocol: 1, protocol: 1 })).toBe("ok");
    expect(compatibility({ minClientProtocol: MIN_CLIENT_PROTOCOL, protocol: PROTOCOL })).toBe(
      "ok",
    );
  });

  it("refuses a server older than this build supports", () => {
    expect(compatibility({ minClientProtocol: 0, protocol: 0 })).toBe("server-outdated");
  });

  it("refuses when the server needs a newer app", () => {
    expect(compatibility({ minClientProtocol: 2, protocol: 3 })).toBe("client-outdated");
  });

  it("defaults the client side to this build's constants", () => {
    const server = { minClientProtocol: 1, protocol: 1 };
    expect(compatibility(server)).toBe(
      compatibility(server, { minServerProtocol: MIN_SERVER_PROTOCOL, protocol: PROTOCOL }),
    );
  });

  it("is ok exactly when each side meets the other's minimum; an old server is named first", () => {
    const version = fc.integer({ max: 10, min: 0 });
    const sides = fc.record({
      client: fc.record({ minServerProtocol: version, protocol: version }),
      server: fc.record({ minClientProtocol: version, protocol: version }),
    });
    fc.assert(
      fc.property(sides, ({ client, server }) => {
        const result = compatibility(server, client);
        const isServerFit = server.protocol >= client.minServerProtocol;
        const isClientFit = client.protocol >= server.minClientProtocol;
        expect(result === "ok").toBe(isServerFit && isClientFit);
        expect(result === "server-outdated").toBe(!isServerFit);
        expect(result === "client-outdated").toBe(isServerFit && !isClientFit);
      }),
    );
  });
});
