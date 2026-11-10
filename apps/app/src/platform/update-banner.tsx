import type { ReactNode } from "react";

/** Native updates are owned above account providers; only web has a visual service-worker banner. */
export const UpdateBanner = ({ children }: { readonly children: ReactNode }) => children;
