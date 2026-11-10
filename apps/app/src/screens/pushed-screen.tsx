import { useIsWide } from "#app/ui/layout.ts";

import { HeadedScreen, type HeadedScreenProps } from "./headed-screen.tsx";

/**
A screen pushed over the tabs (a project, a preset, a task): Back, the labelled actions, its title,
and the body.
*/
export const PushedScreen = (props: HeadedScreenProps) => (
  <HeadedScreen {...props} variant="pushed" />
);

/**
The header of a list a phone pushes from More, Settings or the bell (Presets, the assistant's log,
Notifications): on a phone the top-level kind, Back in its bar and the large title under it at
Settings' height (a `title1` sat 12 px higher than every other list's title: QA PR55-1-18, R27-10,
bug-lessons 344); on a computer, where it is a page of its own, Back and its `title1`.
*/
export const useListVariant = () => (useIsWide() ? "pushed" : "top");

/** A list pushed from another screen (Presets from Settings): see `useListVariant`. */
export const ListScreen = (props: HeadedScreenProps) => (
  <HeadedScreen {...props} variant={useListVariant()} />
);
