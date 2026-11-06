import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

/** The native implementation also works on Hermes without crypto.subtle. */
export const sha256Text = async (text: string): Promise<string> =>
  await digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
