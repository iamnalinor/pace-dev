import type { enDevices } from "../en/devices.ts";

/** Devices: the phone's and the computers' data in the cloud, and connecting a computer. */
export const ruDevices: { readonly [K in keyof typeof enDevices]: string } = {
  "devices.lastActivity": "Данные {duration} назад",
  "devices.justNow": "Данные только что",
  "devices.nothingYet": "Ещё ничего не прислал",
  "devices.lastDataAt": "Данные {time}",
  "devices.thisDevice": "Это устройство",
  "devices.add": "Добавить компьютер",
  "devices.name": "Название",
  "devices.defaultName": "Мой компьютер",
  "devices.create": "Создать токен",
  "devices.createFailed": "Не удалось создать токен. Проверьте соединение.",
  "devices.os": "Система компьютера",
  "devices.osWindows": "Windows",
  "devices.osMacos": "macOS",
  "devices.osLinux": "Linux",
  "devices.step1Windows":
    "1. На этом компьютере откройте PowerShell: нажмите «Пуск», наберите «PowerShell» и нажмите Enter.",
  "devices.step1Macos":
    "1. На этом Mac откройте Терминал: нажмите ⌘ Пробел, наберите «Терминал» и нажмите Enter.",
  "devices.step1Linux": "1. На этом компьютере откройте терминал (Ctrl+Alt+T в Ubuntu и Mint).",
  "devices.linuxPackages":
    "Агенту нужны xdotool и xprintidle. Установите их строкой для вашей системы:",
  "devices.step2Windows":
    "2. Вставьте это туда и нажмите Enter. Если Python нет, команда сначала установит его (winget может попросить разрешения), затем агент Pace запросит токен:",
  "devices.step2":
    "2. Вставьте это туда и нажмите Enter. Команда скачает агент Pace, который затем запросит токен:",
  "devices.tokenPrompt":
    "Когда появится скрытый запрос, скопируйте этот токен, вставьте его туда и нажмите Enter. При вставке символы не показываются:",
  "devices.macPython":
    "Если Mac предложит установить инструменты разработчика для командной строки, согласитесь: в них есть python3. Затем вставьте строку ещё раз.",
  "devices.step3":
    "3. Агент запускается вместе с компьютером и каждые 5\u{A0}минут отправляет названия приложений и время — никогда не заголовки окон и не адреса страниц.",
  "devices.step4": "4. Посмотреть, что он отправляет:",
  "devices.waylandGnome":
    "GNOME на Wayland не даёт другим программам видеть, какое окно на переднем плане, поэтому агент там не работает: выберите «GNOME on Xorg» на экране входа. KDE Plasma на Wayland работает, если установлен kdotool.",
  "devices.checkList": "В течение 5\u{A0}минут в его строке появится время последней отправки.",
  "devices.tokenOnce":
    "Токен показывается только сейчас. Его нет в команде и истории терминала, но он сохранится на компьютере. Он может только отправлять данные о приложениях; «Отключить» отзывает его. Потеряли? Отключите компьютер и добавьте заново.",
  "devices.copy": "Скопировать команду",
  "devices.copyToken": "Скопировать токен",
  "devices.shareToken": "Отправить токен",
  "devices.copied": "Скопировано",
  "devices.share": "Отправить команду",
  "devices.calendar": "Отправлять календарь телефона",
  "devices.calendarHint":
    "Ваши и принятые события уходят в Pace, чтобы веб и неделя их показывали. Если выключить, копия удалится.",
  "devices.done": "Готово",
};
