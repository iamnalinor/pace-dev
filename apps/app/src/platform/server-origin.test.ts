import type { InstanceError } from "@pace/client";

import { fakeInstance } from "@pace/client/testing";
import { type Instance, InstanceSchema, ok, type Result } from "@pace/core";

import { checkServer } from "./server-origin.ts";
import { serverStore } from "./server-store.ts";

describe("explicit server configuration retry", () => {
  it("ignores a successful retry after the person moved to another server", async () => {
    const answer = Promise.withResolvers<Result<Instance, InstanceError>>();
    const checkInstance = jest.fn(async () => await answer.promise);
    serverStore.setState({
      origin: "https://old.example",
      configurationError: { reason: "project-mismatch" },
    });
    const retry = checkServer({ baseUrl: "https://old.example", checkInstance });
    serverStore.setState({
      origin: "https://new.example",
      configurationError: { reason: "missing-service-account" },
    });
    answer.resolve(ok(InstanceSchema.parse(fakeInstance)));
    await retry;
    expect(serverStore.getState().configurationError).toEqual({
      reason: "missing-service-account",
    });
    expect(checkInstance).toHaveBeenCalledTimes(1);
  });
});

it("shares discovery while a start and watcher ask together", async () => {
  const answer = Promise.withResolvers<Result<Instance, InstanceError>>();
  const checkInstance = jest.fn(async () => await answer.promise);
  const runtime = { baseUrl: "https://same.example", checkInstance };
  serverStore.setState({ origin: runtime.baseUrl });
  const first = checkServer(runtime);
  const second = checkServer(runtime);
  answer.resolve(ok(InstanceSchema.parse(fakeInstance)));
  await Promise.all([first, second]);
  expect(checkInstance).toHaveBeenCalledTimes(1);
});
