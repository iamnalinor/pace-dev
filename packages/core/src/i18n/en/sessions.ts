/** Settings → Devices and sessions: every way into the account, and connecting an AI app. */
export const enSessions = {
  "sessions.title": "Devices and sessions",
  "sessions.hint":
    "Everything signed in to your account: browsers, this app, computers that send app usage and AI apps. End anything you do not recognise.",
  "sessions.loading": "Loading devices",
  "sessions.failed": "Couldn't load devices",
  "sessions.retry": "Try again",
  "sessions.kind.browser": "Browser",
  "sessions.kind.app": "Phone app",
  "sessions.kind.agent": "Computer",
  "sessions.kind.dev": "Developer sign-in",
  "sessions.kind.mcp": "AI app",
  "sessions.revoke": "Revoke",
  "sessions.disconnect": "Disconnect",
  "sessions.revokeConfirm": "End this session?",
  "sessions.revokeCurrentConfirm": "End this session? This device signs out.",
  "sessions.disconnectConfirm": "Disconnect this computer? Its token stops working at once.",
  "sessions.revokeAppConfirm": "Revoke this app's access?",
  "sessions.revokeFailed": "Couldn't end the session. Try again.",
  "connectAi.open": "Connect an AI app",
  "connectAi.intro":
    "Pace works as an MCP server. Add this URL to an AI app that supports MCP: it opens Pace to sign in with Telegram, and you choose what it may see and change.",
  "connectAi.url": "Server URL",
  "connectAi.copy": "Copy the URL",
  "connectAi.share": "Send the URL",
  "connectAi.copied": "Copied",
  "connectAi.claude": "Claude",
  "connectAi.claudeSteps":
    "Settings → Connectors → Add custom connector, paste the URL and add it. Claude opens Pace to sign in.",
  "connectAi.chatgpt": "ChatGPT",
  "connectAi.chatgptSteps":
    "Turn on developer mode (Settings → Apps & Connectors → Advanced), then create a connector with the URL and OAuth sign-in.",
  "connectAi.other": "Other apps",
  "connectAi.otherSteps":
    "Any MCP client with OAuth (Cursor, Claude Code, MCP Inspector): add a remote HTTP server with the URL; it opens Pace to sign in.",
  "connectAi.revokeHint":
    "A connected app shows up in Devices and sessions; Revoke there cuts its access at once.",
} as const;
