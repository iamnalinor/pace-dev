import type { enDevices } from "../en/devices.ts";

/** Devices: the phone's and the computers' data in the cloud, and connecting a computer. */
export const ruDevices: { readonly [K in keyof typeof enDevices]: string } = {
  "devices.title": "Устройства",
  "devices.hint":
    "Телефоны и компьютеры, которые сообщают Pace, какое приложение на экране (только названия и время, без содержимого), чтобы День и Неделя показывали, где вы сидели.",
  "devices.loading": "Загружаем устройства…",
  "devices.failed": "Не удалось загрузить устройства. Проверьте соединение.",
  "devices.empty": "Пока ничего не присылает данные.",
  "devices.computer": "Компьютер",
  "devices.phone": "Телефон",
  "devices.lastActivity": "Данные {duration} назад",
  "devices.justNow": "Данные только что",
  "devices.nothingYet": "Ещё ничего не прислал",
  "devices.connected": "Подключён {date}",
  "devices.disconnect": "Отключить",
  "devices.disconnectConfirm": "Отключить «{name}»? Его токен сразу перестанет работать.",
  "devices.disconnectFailed": "Не удалось отключить. Попробуйте ещё раз.",
  "devices.add": "Добавить компьютер",
  "devices.name": "Название",
  "devices.defaultName": "Мой компьютер",
  "devices.create": "Создать токен",
  "devices.createFailed": "Не удалось создать токен. Проверьте соединение.",
  "devices.step1":
    "1. Установите на этом компьютере ActivityWatch и запустите его: он записывает, какое приложение на экране. В меню в трее включите «Запускать при входе».",
  "devices.openActivityWatch": "Открыть activitywatch.net",
  "devices.step2":
    "2. Вставьте это в терминал на нём. Команда скачает мост, сохранит токен компьютера и будет отправлять данные каждые 5 минут:",
  "devices.step3": "3. В течение 5 минут в его строке появится время последней отправки.",
  "devices.tokenOnce":
    "Токен — внутри команды и показывается только сейчас. Потеряли? Отключите компьютер и добавьте заново.",
  "devices.copy": "Скопировать команду",
  "devices.copied": "Скопировано",
  "devices.share": "Отправить команду",
  "devices.otherSystems":
    "macOS или Windows: та же команда python3; без systemd запускайте «pace_aw_bridge.py run» каждые 5 минут (launchd, Планировщик заданий).",
  "devices.calendar": "Отправлять календарь телефона",
  "devices.calendarHint":
    "Ваши и принятые события уходят в Pace, чтобы веб и неделя их показывали. Если выключить, копия удалится.",
  "devices.done": "Готово",
};
