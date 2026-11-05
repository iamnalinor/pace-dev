import type { enServer } from "../en/server.ts";

/** The server the app talks to: choosing one, and the app and server versions not fitting. */
export const ruServer: { readonly [K in keyof typeof enServer]: string } = {
  "server.misconfigured":
    "Ошибка настройки сервера. Попросите владельца проверить настройки и повторите попытку.",
  "server.firebaseAndroidInvalid":
    "Настройки Firebase для Android на сервере неполные. Попросите владельца исправить их.",
  "server.firebaseAndroidNotJson":
    "Не удалось прочитать настройки Firebase для Android на сервере. Попросите владельца исправить их.",
  "server.firebaseDuplicatePackage":
    "На сервере несколько настроек Firebase для одного Android-приложения. Попросите владельца исправить их.",
  "server.firebasePolicyInvalid":
    "На сервере неверно задан режим проверки Firebase. Попросите владельца исправить его.",
  "server.firebaseAccountInvalid":
    "Не удалось прочитать служебный аккаунт Firebase на сервере. Попросите владельца исправить его.",
  "server.firebaseAndroidMissing":
    "На сервере нет настроек Firebase для Android. Попросите владельца добавить их.",
  "server.firebaseAccountMissing":
    "На сервере нет служебного аккаунта Firebase. Попросите владельца добавить его.",
  "server.firebaseNoAndroid":
    "В настройках Firebase на сервере нет Android-приложений. Попросите владельца добавить приложение.",
  "server.firebaseProjectMismatch":
    "Настройки Firebase на сервере относятся к разным проектам. Попросите владельца исправить их.",
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
  "server.restartPending": "Перезапустите приложение для смены сервера",
  "server.restartExplanation":
    "Сервер {host} сохранён. Перезапустите Pace, чтобы продолжить на нём.",
  "server.restartApp": "Перезапустить Pace",
  "server.restartFailed":
    "Не удалось перезапустить Pace. Повторите попытку или закройте и откройте приложение.",
  "server.moveFailed": "Не удалось сменить сервер. Попробуйте ещё раз.",
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
  "server.mismatchAppWeb":
    "На этой странице Pace старее, чем на сервере. Обновите страницу, чтобы загрузить новую версию.",
  "server.mismatchServerWeb":
    "На этом сервере старая версия Pace. Попросите владельца сервера обновить его.",
};
