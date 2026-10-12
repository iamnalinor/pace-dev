import { cryptoToInstall } from "./random-values.ts";

const fill = (array: Uint8Array): Uint8Array => array.fill(7);
const own = (array: Uint8Array): Uint8Array => array.fill(1);

describe("cryptoToInstall", () => {
  it("gives a runtime without crypto (Hermes) a getRandomValues from the platform", () => {
    const installed = cryptoToInstall({}, fill);
    expect(installed?.getRandomValues?.(new Uint8Array(2))).toEqual(new Uint8Array([7, 7]));
  });

  it("keeps a runtime's own getRandomValues", () => {
    expect(cryptoToInstall({ crypto: { getRandomValues: own } }, fill)).toBeUndefined();
  });
});
