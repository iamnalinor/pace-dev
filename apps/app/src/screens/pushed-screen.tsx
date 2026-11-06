import { HeadedScreen, type HeadedScreenProps } from "./headed-screen.tsx";

/**
A screen pushed over the tabs (a project, Presets, Notifications on a phone): Back, the labelled
actions, its title, and the body.
*/
export const PushedScreen = (props: HeadedScreenProps) => (
  <HeadedScreen {...props} variant="pushed" />
);
