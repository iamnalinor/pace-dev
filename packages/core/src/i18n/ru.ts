import type { en } from "./en.ts";

type Catalog = { readonly [K in keyof typeof en]: string };

export const ru: Catalog = {
  "app.name": "Pace",

  "nav.now": "Сейчас",
  "nav.day": "День",
  "nav.add": "Добавить",
  "nav.projects": "Проекты",
  "nav.insights": "Аналитика",
  "nav.settings": "Настройки",
  "nav.main": "Основное",

  "login.title": "Вход в Pace",
  "login.subtitle": "Ваши задачи и время — в своём темпе.",
  "login.telegram": "Войти через Telegram",
  "login.openBot": "Открыть {bot} в Telegram",
  "login.waiting": "Ждём ответа от Telegram…",
  "login.webFallback": "Войти через браузер",
  "login.notAllowed": "Этого аккаунта Telegram нет в списке.",
  "login.openTelegram": "Открыть Telegram",
  "login.timeout": "Telegram не ответил вовремя. Попробуйте ещё раз.",
  "login.failed": "Не удалось войти. Попробуйте ещё раз.",

  "auth.signingIn": "Входим…",
  "auth.invalidLink": "Эта ссылка для входа больше не действует.",
  "auth.backToLogin": "Назад ко входу",
  "login.botFallback": "Войти через бота",
  "login.botHint": "Откройте бота, нажмите Start и вернитесь сюда.",
  "login.dev": "Вход для разработки",
  "login.devId": "Telegram id",
  "login.devSubmit": "Войти как dev",

  "appLink.title": "Открыть в Pace",
  "appLink.open": "Открыть в Pace",
  "appLink.fallback":
    "Если ничего не происходит, установите Pace из последнего релиза и откройте ссылку снова.",
  "appLink.missing": "В этой ссылке нет токена входа.",

  "oauth.title": "Подключение приложения",
  "oauth.body":
    "Здесь Pace будет спрашивать разрешение для подключённых приложений. Появится на этапе 1.",

  "now.empty": "Сейчас дел нет.",
  "day.empty": "Сегодня ничего не записано.",
  "add.empty": "Добавление задач появится на этапе 1.",
  "projects.empty": "Проектов пока нет.",
  "insights.empty": "Аналитика появится на этапе 3.",

  "settings.title": "Настройки",
  "settings.timezone.device": "Это устройство: {tz}",
  "settings.timezone.unset": "Пока не задан",
  "settings.language.en": "English",
  "settings.language.ru": "Русский",
  "settings.theme": "Тема",
  "settings.theme.system": "Как в системе",
  "settings.theme.light": "Светлая",
  "settings.theme.dark": "Тёмная",
  "settings.language": "Язык",
  "settings.timezone": "Часовой пояс",
  "settings.timezone.account": "Аккаунт: {tz}",
  "settings.timezone.use": "Использовать {tz} для аккаунта",
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
  "common.home": "На главную",

  "errors.offline": "Нет сети. Изменения синхронизируются при подключении.",
  "errors.llmUnavailable": "Ассистент сейчас недоступен. Попробуйте чуть позже.",
  "errors.notFound": "Не найдено.",
  "errors.pageNotFound": "Страница не найдена",
  "errors.generic": "Что-то пошло не так",
  "errors.syncFailed": "Синхронизация не удалась: {reason}",
};
