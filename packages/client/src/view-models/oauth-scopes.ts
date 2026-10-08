import type { MessageKey, OAuthScope } from "@pace/core";

/** The plain-language line shown for each scope (every scope must have one). */
export const SCOPE_KEYS: Readonly<Record<OAuthScope, MessageKey>> = {
  "analytics:read": "oauth.scope.analyticsRead",
  offline_access: "oauth.scope.offlineAccess",
  "tasks:read": "oauth.scope.tasksRead",
  "tasks:write": "oauth.scope.tasksWrite",
  "time:read": "oauth.scope.timeRead",
  "time:write": "oauth.scope.timeWrite",
};
