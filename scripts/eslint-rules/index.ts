import { noRawDesignValues } from "./no-raw-design-values.ts";

/** The `pace` ESLint plugin: project-specific rules, registered in eslint.config.ts. */
export const plugin = { rules: { "no-raw-design-values": noRawDesignValues } };
