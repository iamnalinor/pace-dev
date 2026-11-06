import type { enSettings } from "../en/settings.ts";

/** The sections of Settings and the rows added with the grouped layout. */
export const ruSettings: { readonly [K in keyof typeof enSettings]: string } = {
  "settings.account": "Аккаунт и язык",
  "settings.tasks": "Задачи",
  "settings.appearance": "Внешний вид",
  "settings.keyboard": "Клавиши",
  "settings.keyboard.newTask": "Новая задача",
  "settings.keyboard.focus": "Фокус",
  "settings.server": "Сервер",
  "settings.server.hint": "Сменить сервер можно на экране входа.",
};
