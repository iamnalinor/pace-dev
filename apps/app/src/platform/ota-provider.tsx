import { createContext, type ReactNode, use, useEffect, useState } from "react";

import type { OtaCoordinator } from "./ota-coordinator.ts";

import { createNativeOtaCoordinator, startNativeOtaUpdates } from "./ota.ts";

const OtaContext = createContext<null | OtaCoordinator>(null);

/** Native code delivery outlives account/server providers and exposes diagnostics to Settings. */
export const OtaProvider = ({ children }: { readonly children: ReactNode }) => {
  const [coordinator] = useState(createNativeOtaCoordinator);
  useEffect(() => startNativeOtaUpdates(coordinator), [coordinator]);
  return <OtaContext value={coordinator}>{children}</OtaContext>;
};

export const useOtaCoordinator = (): null | OtaCoordinator => use(OtaContext);
