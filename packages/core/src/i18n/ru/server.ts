import type { enServer } from "../en/server.ts";

/** The server the app talks to: choosing one, and the app and server versions not fitting. */
export const ruServer: { readonly [K in keyof typeof enServer]: string } = {
  "server.line": "Сервер: {host}",
  "server.change": "Сменить",
  "server.changeLabel": "Сменить сервер, сейчас {host}",
  "server.title": "Сменить сервер",
  "server.subtitle": "Входите на своём сервере Pace.",
  "server.address": "Адрес сервера",
  "server.placeholder": "pace.example.dev",
  "server.check": "Проверить",
  "server.use": "Использовать этот сервер",
  "server.reset": "Вернуть сервер по умолчанию",
  "server.name": "Название",
  "server.version": "Версия",
  "server.bot": "Бот в Telegram",
  "server.invalidUrl": "Введите адрес сервера, например pace.example.dev",
  "server.insecure": "Нужен адрес с https://",
  "server.unreachable": "Не удаётся связаться с сервером",
  "server.notPace": "Это не сервер Pace",
  "server.serverOutdated":
    "На этом сервере старая версия Pace. Обновите сервер или выберите другой.",
  "server.clientOutdated":
    "Этому серверу нужно более новое приложение Pace. Обновите приложение или выберите другой сервер.",
  "server.mismatch": "Версии сервера и приложения не совпадают",
  "server.mismatchApp": "Обновите приложение, чтобы пользоваться этим сервером.",
  "server.mismatchServer":
    "На этом сервере старая версия Pace. Обновите сервер или выйдите и войдите на другом.",
};
