// These ESLint plugins ship without type definitions. Declaring the shape we use
// keeps eslint.config.ts type-checked instead of silently `any`.
declare module "eslint-plugin-jsx-a11y" {
  import type { Linter } from "eslint";

  const plugin: { flatConfigs: Record<"recommended" | "strict", Linter.Config> };
  export default plugin;
}

declare module "eslint-plugin-promise" {
  import type { Linter } from "eslint";

  const plugin: { configs: Record<"flat/recommended", Linter.Config> };
  export default plugin;
}

declare module "eslint-plugin-security" {
  import type { Linter } from "eslint";

  const plugin: { configs: Record<"recommended", Linter.Config> };
  export default plugin;
}
