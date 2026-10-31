/** The server the app talks to: choosing one, and the app and server versions not fitting. */
export const enServer = {
  "server.line": "Server: {host}",
  "server.change": "Change",
  "server.changeLabel": "Change server, now {host}",
  "server.title": "Change server",
  "server.subtitle": "Sign in on a Pace server of your own.",
  "server.address": "Server address",
  "server.placeholder": "pace.example.dev",
  "server.check": "Check",
  "server.use": "Use this server",
  "server.reset": "Reset to default",
  "server.name": "Name",
  "server.version": "Version",
  "server.bot": "Telegram bot",
  "server.invalidUrl": "Enter the server's address, like pace.example.dev",
  "server.insecure": "Use an https:// address",
  "server.unreachable": "Can't reach this server",
  "server.notPace": "This is not a Pace server",
  "server.serverOutdated": "This server runs an older Pace. Update the server or use another one.",
  "server.clientOutdated":
    "This server needs a newer Pace app. Update the app or use another server.",
  "server.mismatch": "Server and app versions don't match",
  "server.mismatchApp": "Update the app to keep using this server.",
  "server.mismatchServer":
    "This server runs an older Pace. Update the server, or log out and sign in on another one.",
} as const;
