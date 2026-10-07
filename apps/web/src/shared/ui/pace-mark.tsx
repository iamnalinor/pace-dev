import type { ComponentProps } from "react";

/** The Pace mark (assets/logo/pace-mark.svg): two chevrons and a dot, inline so it themes. */
export const PaceMark = (props: ComponentProps<"svg">) => (
  <svg aria-hidden="true" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      className="stroke-faint"
      d="M18 30 L48 60 L18 90"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="16"
    />
    <path
      className="stroke-accent"
      d="M58 30 L88 60 L58 90"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="16"
    />
    <circle className="fill-fg" cx="106" cy="60" r="8" />
  </svg>
);
