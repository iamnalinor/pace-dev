import type { ReactNode } from "react";

import { HeadedScreen, type HeadedScreenProps } from "./headed-screen.tsx";

/**
A destination of the sidebar that a phone reaches through More (Projects, Insights, History,
Settings): the top-level header of a main screen, with Back to More on a phone and none beside
the sidebar or the rail.
*/
export const DestinationScreen = ({
  period,
  subtitle,
  ...props
}: HeadedScreenProps & {
  /** The period control in the subtitle row (Insights' week). */
  readonly period?: ReactNode;
  /** The body holds no control: it is a keyboard stop of this name (see `Screen`). */
  readonly scrollLabel?: string;
  readonly subtitle?: string;
}) => <HeadedScreen {...props} header={{ period, subtitle }} variant="top" />;
