import { createContext, type ReactNode, use } from "react";

import type { OtaCoordinator } from "./ota-coordinator.ts";

const OtaContext = createContext<null | OtaCoordinator>(null);

/** Web keeps the existing service worker banner and does not import native update modules. */
export const OtaProvider = ({ children }: { readonly children: ReactNode }) => children;
export const useOtaCoordinator = (): null | OtaCoordinator => use(OtaContext);
