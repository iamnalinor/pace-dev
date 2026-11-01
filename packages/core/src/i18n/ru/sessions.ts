import type { enSessions } from "../en/sessions.ts";

/** Settings → Devices and sessions: every way into the account, and connecting an AI app. */
export const ruSessions: { readonly [K in keyof typeof enSessions]: string } = {
  "sessions.title": "Устройства и сеансы",
  "sessions.hint":
    "Всё, что вошло в ваш аккаунт: браузеры, это приложение, компьютеры, которые присылают данные о приложениях, и ИИ-приложения. Завершите то, чего не узнаёте.",
  "sessions.loading": "Загружаем устройства",
  "sessions.failed": "Не удалось загрузить устройства",
  "sessions.retry": "Попробовать снова",
  "sessions.kind.browser": "Браузер",
  "sessions.kind.app": "Приложение на телефоне",
  "sessions.kind.agent": "Компьютер",
  "sessions.kind.dev": "Вход разработчика",
  "sessions.kind.mcp": "ИИ-приложение",
  "sessions.revoke": "Завершить",
  "sessions.disconnect": "Отключить",
  "sessions.revokeConfirm": "Завершить этот сеанс?",
  "sessions.revokeCurrentConfirm": "Завершить этот сеанс? Вы выйдете на этом устройстве.",
  "sessions.disconnectConfirm": "Отключить этот компьютер? Его токен сразу перестанет работать.",
  "sessions.revokeAppConfirm": "Отозвать доступ этого приложения?",
  "sessions.revokeFailed": "Не удалось завершить сеанс. Попробуйте ещё раз.",
  "connectAi.open": "Подключить ИИ-приложение",
  "connectAi.intro":
    "Pace работает как MCP-сервер. Добавьте этот адрес в ИИ-приложение с поддержкой MCP: оно откроет Pace для входа через Telegram, а вы выберете, что ему можно видеть и менять.",
  "connectAi.url": "Адрес сервера",
  "connectAi.copy": "Скопировать адрес",
  "connectAi.share": "Отправить адрес",
  "connectAi.copied": "Скопировано",
  "connectAi.claude": "Claude",
  "connectAi.claudeSteps":
    "Settings → Connectors → Add custom connector, вставьте адрес и добавьте. Claude откроет Pace для входа.",
  "connectAi.chatgpt": "ChatGPT",
  "connectAi.chatgptSteps":
    "Включите режим разработчика (Settings → Apps & Connectors → Advanced), затем создайте коннектор с этим адресом и входом через OAuth.",
  "connectAi.other": "Другие приложения",
  "connectAi.otherSteps":
    "Любой MCP-клиент с OAuth (Cursor, Claude Code, MCP Inspector): добавьте удалённый HTTP-сервер с этим адресом; он откроет Pace для входа.",
  "connectAi.revokeHint":
    "Подключённое приложение появится в «Устройствах и сеансах»; «Завершить» там сразу закрывает ему доступ.",
} as const;
