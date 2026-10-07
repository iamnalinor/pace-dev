import { Fragment } from "react";
import { Text } from "react-native";

import type { MetaPart } from "@pace/client";

import { metaTexts, type MetaTone } from "#app/format/meta.ts";

import { useViewer } from "./use-viewer.ts";

const TONE: Readonly<Record<MetaTone, string>> = {
  plain: "",
  strong: "font-medium text-fg",
  warn: "text-warn",
};

/** A row's meta line: `ASAP · by end of day`, the importance emphasised, lateness in orange. */
export const MetaLine = ({ parts }: { readonly parts: readonly MetaPart[] }) => {
  const viewer = useViewer();
  if (parts.length === 0) {
    return null;
  }
  return (
    <Text className="font-sans text-[12px] leading-4 text-muted">
      {metaTexts(parts, viewer).map((piece, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- positional pieces without ids; a text can repeat
        <Fragment key={index}>
          {index === 0 ? null : " · "}
          <Text className={TONE[piece.tone]}>{piece.text}</Text>
        </Fragment>
      ))}
    </Text>
  );
};
