import type { en } from "./en.ts";

type Catalog = { readonly [K in keyof typeof en]: string };

export const ru: Catalog = {
  "app.name": "Pace",

  "nav.now": "Сейчас",
  "nav.day": "День",
  "nav.add": "Добавить",
  "nav.projects": "Проекты",
  "nav.insights": "Аналитика",

  "login.title": "Вход в Pace",
  "login.subtitle": "Ваши задачи и время — в своём темпе.",
  "login.telegram": "Войти через Telegram",
  "login.openBot": "Открыть {bot} в Telegram",
  "login.waiting": "Ждём ответа от Telegram…",
  "login.webFallback": "Войти через браузер",
  "login.notAllowed": "Этого аккаунта Telegram нет в списке.",

  "settings.theme": "Тема",
  "settings.theme.system": "Как в системе",
  "settings.theme.light": "Светлая",
  "settings.theme.dark": "Тёмная",
  "settings.language": "Язык",
  "settings.timezone": "Часовой пояс",
  "settings.digestWindows": "Время сводок",
  "settings.quietHours": "Тихие часы",
  "settings.connectedApps": "Подключённые приложения",
  "settings.logout": "Выйти",

  "common.save": "Сохранить",
  "common.cancel": "Отмена",
  "common.undo": "Отменить",
  "common.done": "Готово",
  "common.delete": "Удалить",
  "common.back": "Назад",
  "common.accept": "Принять",
  "common.skip": "Пропустить",
  "common.retry": "Повторить",

  "errors.offline": "Нет сети. Изменения синхронизируются при подключении.",
  "errors.llmUnavailable": "Ассистент сейчас недоступен. Попробуйте чуть позже.",
  "errors.notFound": "Не найдено.",
};
