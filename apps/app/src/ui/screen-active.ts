import { createContext, use } from "react";

/**
Whether the screen a component sits on is the one in front. A tab left behind, or a screen
under a pushed one, stays mounted: its shortcuts must stay silent. Outside any screen (the
sidebar, a test) it counts as in front.
*/
export const ScreenActiveContext = createContext(true);

export const useIsScreenActive = (): boolean => use(ScreenActiveContext);
