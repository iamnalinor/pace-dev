import type { ReactNode } from "react";

/*
`expo-share-intent` on the web build: the PWA's share target opens `/add?title=&text=&url=`
(`manifest.webmanifest`), so what was shared is read from the address.
*/

export const ShareIntentProvider = ({ children }: { readonly children: ReactNode }) => children;

const sharedText = (): null | string => {
  const params = new URLSearchParams(globalThis.location.search);
  const text = [params.get("title"), params.get("text")]
    .filter((part) => part !== null && part !== "")
    .join(" ");
  return text === "" ? null : text;
};

// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the name expo-share-intent exports
export const useShareIntentContext = () => {
  const text = sharedText();
  const webUrl = new URLSearchParams(globalThis.location.search).get("url");
  return {
    error: null,
    hasShareIntent: text !== null || webUrl !== null,
    isReady: true,
    resetShareIntent: (): void => undefined,
    shareIntent: { text, webUrl },
  };
};
