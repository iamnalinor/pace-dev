import { describe, expect, it, vi } from "vitest";

import { createQueryClient } from "./query-client.ts";
import { ApiError } from "./unwrap.ts";

const failWith = (status: number) =>
  vi.fn(async () => {
    await Promise.resolve();
    throw new ApiError(status, { message: "x" });
  });

describe("createQueryClient", () => {
  it("reports 401 from queries and mutations, but not other errors", async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient(onUnauthorized);

    await expect(
      client.query({ queryFn: failWith(403), queryKey: ["forbidden"] }),
    ).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();

    await expect(client.query({ queryFn: failWith(401), queryKey: ["expired"] })).rejects.toThrow();
    const mutation = client.getMutationCache().build(client, { mutationFn: failWith(401) });
    await expect(mutation.execute(undefined)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it.each([
    [404, 1],
    [503, 3],
  ])(
    "a %i is attempted %i time(s): only server/network errors are retried",
    async (status, attempts) => {
      const queryFn = failWith(status);
      const client = createQueryClient(() => undefined);
      client.setQueryDefaults(["retry"], { retryDelay: 0 });

      await expect(client.query({ queryFn, queryKey: ["retry"] })).rejects.toThrow();

      expect(queryFn).toHaveBeenCalledTimes(attempts);
    },
  );
});
