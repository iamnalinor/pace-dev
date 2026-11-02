# Feedback round 4 («pace замечания 4», 2026-10-13)

The owner's fourth feedback document, verbatim as text. Screenshots are replaced by their
descriptions in [brackets]; a caption follows the screenshot it is about. It came with no request
text beyond the file itself. What was done about each point is in `plan.md` (Stage 8).

> [Screenshot: the web update card in the sidebar's bottom-left corner: «A new version of Pace
> is ready» / «Refresh the page to get the latest fixes.» (this detail line highlighted as a
> text selection) / «Later» and an indigo «Refresh».]

Later не нужен, выделенная подпись тоже не нужна. Кнопку можно оставить refresh page. И сузить бы его, чтоб был прямоугольник
Мы в одном из обновлений поменяли цвет с акцентного зеленого на голубой. Для лого это не оч, там зеленый круче смотрелся. На кнопках зеленый/салатовый то жнорм смотрелся, но не везде. 
Давай смотреть в зависимости от места: где нужен акцент (какое-то важное действие) – вернем старый цвет, где что-то не очень активное – оставим текущий. На лого старый цвет лучше смотрелся

> [Screenshot: the time bar on Now: «What are you doing?» field, a pale indigo ▶, four outlined
> buttons Calendar, Rest (green), Sport (green), Chores, each with a «⋯» in its corner.]

Три точки – на шестеренки, и только там где это актуально. У Calendar, например, нет, там пикер всегда. У Chores аналогично
Среди активностей давай оставим Calendar, Task (открываем пикер тасок и выбираем), Chores, Rest. Получается шестеренки даже нигде не нужны (все всегда открывают менюшки, в Rest можно добавить подвиды – сон небольшой, отдых и тд, придумай). Давай уберем их везде

> [Screenshot: the same bar with «7:30 - 8:30 - ходил в военкомат.» typed in the field.]

Кастомным вводом хотим не только создавать текущие активности но и трекать что-то старое. Т.е. ввод в первую очередь под сообщение ллмке, и она дальше решает что создать. UI под это нужно адаптировать. Т.е. ллмка может предложить создать новую таску, может предложить отредактировать, может предложить удалить какую-то таску. Аналогично должен работать ввод через тг-бота свободным текстом, тоже с последующим подтверждением. Такая идея работает и на вводе тасок, и на вводе в активности. В UI у нас два разных поля для разных вводов. В тг боте поле одно, поэтому там нужно добавить доп этап классификации – мы смотрим, хочет ли пользователь затрекать таску или активность. Если нет 100% уверенности, показываем, как классифицировали запрос и даем пикер

> [Screenshot: Devices screen: «Pixel 9a · Phone · Last data 11h 29m ago», a full-width indigo
> «Add a computer».]

Тут на этапе загрузки показываем скелетоны. Если последние данные слишком давно (давай поставим как порог 8 часов), то показываем точное время, а не продолжительность

> [Screenshot: the «Add a computer» dialog: «1. Install ActivityWatch on that computer and start
> it… Turn on “Start on login” in its tray menu.» with an «Open activitywatch.net» button; «2.
> Paste this into a terminal there. It downloads the bridge, saves this computer's token and
> sends every 5 minutes:».]

Но ведь это определенно не кроссплатформенно. Давай сверху пикер Windows / MacOS / Linux (с логами), и под каждого конкретную инструкцию
Зачем нам отдельный ActivityWatch? Правда ли без него нельзя самостоятельно справиться? Или так проще

> [Screenshot: a device row «T-Bank Mac · Computer · Nothing sent yet · Connected Oct 13, 2026»
> with a wide white «Disconnect» button.]

Кнопка disconnect слишком широкая
Кнопка добавления девайса на телефонах ничего не делает вроде
Скок щас апкшки весят? Боты вроде могут отправлять меньше 50мб.  Давай после релиза кидать мне новые апк в лс в телегу. Мой id 1919230638, давай положим в variables (скажи какой или добавь сам если можешь).
Плюс мы там сделали фичу чтобы у нас было два groq токена, скажи где и как добавить второй

> [Screenshot: Settings on a computer: Presets, Notification log; EXPORT «Everything in the
> account as an Excel file…» with a full-width «Download .xlsx»; PHONES AND COMPUTERS with a
> full-width «Devices»; CONNECTED APPS «Apps that reach your account through MCP. Revoking cuts
> their access at once. No app is connected yet.»; full-width «Log out»; «Delete account».]

На пк чето кнопки слишком широкие. Плюс в Connected apps ваще ничего не сказано как добавить MCP – добавь кнопку по которой мы показываем инструкцию
Отдельный раздел Devices с переходом по кнопке мб странно, можно просто показывать устройства опрятным списком прямо здесь.
Внизу у нас кнопки:
Export data(переезжает сверху), по нажатию на нее скачиваем эксель табличку, доп описание на сайте можно не делать
Log out
И подраздел danger
Wipe data (как factory reset, делает акк чистым как будто после реги)
Delete account
Оба подтверждаем сначала на сайте, а потом в тг боте – этакое 2fa.
О кста го в тг бота присылать уведы о входах (если вход через веб тг – присылаем уведомление вида «Вы вошли с такого-то устройства с IP <>, Germany”, если через диплинк – присылаем аналогично но с кнопкой, а еще в Devices показывать все активные сессии (втч браузерные – т.е. классифицируем браузер / приложение / агент активности или как-то так) с возможностью ревокнуть каждый. Да и MCP можно сюда же перенести. Круто же? Единая система сессий. Мне кажется круто
Даю ок на рефакторинг. Подумай, где будет полезно что-то переделать, чтобы код стал чище, правильнее и тд. Заюзай плагин superpowers как обычно. Делать ломающие изменения можно, мы не хотим обрастать костылями

> [Screenshot: Settings: DIGEST TIMES «When the daily digests arrive, in the account's zone.»
> with a full-width «Add a time»; QUIET HOURS From 23:00 To 08:00.]

Систему уведомлений тоже надо систематизировать. Хочется единый пул: чтобы было видно и в браузере, и в аппке, и в тг. Виды уведомлений соответственно Login и Deadline Digest (назовем это так). Старых Digest-ов не будет. В указанные слоты мы присылаем инфу по таскам, у которых осталось менее 24 часов до дедлайна (точнее останется меньше 24 часов после присылки следующего digest – т.е. присылаем когда более 24 часов остается, чтобы были минимум сутки). Бай дефолт давай Deadline Digest слать ток в тг, в аппку и в веб не слать.
Еще насчет автотрекинга сна. Не нужно уведомлять «го затрекаем сон», если мы видим незатреканный слот, то после некотороого времени активности на теле (вдруг я ночью проснулся, чет глянул и пошел дальше спать) – т.е. больше порога небольших перерывов – мы заводим активность сна (давай всегда задним числом для простоты). Или не, лучше так:
- активность сна с открытым моментом окончания мы заводим в подходящее время после достаточно продолжительного перерыва в активности, и если сна в этом окне уже не было; моментом начала будет момент отсутствия активности на теле
- чел может завести активность сна сам, мы уважаем его момент начала;
-  если видим активность на теле, завершаем активность в аппке. Но при этом если активности на теле и дальше нет и она подходит под критерий небольших перерывов в сне, то мы задним числом ту старую запись снова открываем (как будто она и не останавливалась).
- активность сна заводим даже если есть другая активность, кроме класса Rest. Если есть наложения, можно потом поподвигать даты

> [Screenshot: the sidebar: Pace logo, indigo «+ New task N», Now, Day, Week, Projects,
> Insights, Inbox (selected), History, Settings.]

Порядок странный. Го так: Tasks (rename Now) -> Activity (rename Day) -> Calendar (rename Week) -> Inbox -> Projects -> Insights -> History -> Settings

> [Screenshot: Now's composer with «bb» typed: a chevron ⌄ on the right, the hint «Enter: the
> assistant fills in a form to check. Shift+Enter: a new line.», a pale indigo «Parse ↵» and «To
> Inbox ⌥↵»; the Inbox counter «0» at the top right.]

Громоздкое, мб попроще?
Стрелочка тоже какая-то странная
При анимке раскрытия артефакт что верхний текст и верхняя половина кнопки съезжают за границу блока и прячутся, потом возвращаются обратно

> [Screenshot: the expanded form: «Check before adding», indigo «Create ↵», ⌃; Title «bb»,
> Category chips, Importance chips, Project chips, «Starts now», «No deadline», «30m by
> category», Description, Link, «Problems».]

Чет тоже громоздкое. Смотри, у нас энивей поле свободное справа есть, го туда перенесем (и соответственно иконки поправим). Check before adding ну звучит странно. Если мы добавляем саим, то мы добавляем сами. Если нам агент предложил что-то добавить/изменить/удалить, мы так и говорим. 

> [Screenshot: «Problems» with a dashed pill input «Add a problem».]

Термина Problem не должно существовать, это Subtasks. И форма тоже какая-то странная

> [Screenshot: the time bar next to Now's right pane (Focus F): Calendar greyed with a dashed
> border.]

> [Screenshot: the same, a toast floating over the right pane: «Calendar starts the meeting on
> now or within 15 minutes. Nothing is on within 15 minutes.»]

Сообщение вылезает хуй пойми где и с задержкой. Я хочу сразу при наведении ну или на телефоне моментально после клика. И описание слишком подробное, можнопросто про то что в календаре нет событий рядом

> [Screenshot: Week grid dimmed behind a dialog: «🚆 Поезд Москва → Ижевск (026ГА Италмас) · 17
> Sat, 17:44–10:43 · From the calendar» with a cross.]

Как-то странно инфа окалендаре вылезает. Во первых, давай сделаем как в Now – слева календарь, справа по клику инфа о событии (или затреканной активности), а на телефонах всплывашку снизу, как при клике на таску условно. Ну и можно как будто чуть больше инфы из календаря подсосать

> [Screenshot: the Week screen: «OCT 12 – OCT 18 Week», «This week» button, ‹ ›, hours 08–23,
> dashed calendar events, a teal tracked block, the page scrolls.]

А еще блять почему оно скроллится? Раз уж тут всего 7-24 часы (что кстати не оч правильно, надо хотяб опцию показывать и ночные часы тоже), стоит сделать так чтобы не скролилось

> [Screenshot: close-up of the greyed «This week» button and the arrows above «17 Sat», «18
> Sun».]

Громоздкая кнопка которая хуй зачем нужна если мы уже на текущей неделе. Мб просто “Reset to today” на всех неделях которые не наши. И у вкладки Day то же самое

> [Screenshot: Day list: «Tracked 1m · Task 1m · Chores 0m»; a dashed box «10h 36m not logged —
> Log it», rows «10:36 – 10:36 Chores Военкомат 0m of ~1h ✎», «10:36 – 10:37 Task Военкомат 1m
> of ~1h ✎», another dashed box «13h 1m not logged — Log it», «+ Log past activity»; dividers
> between some rows only.]

Ну чето дизайн снова странный. Где-то есть черточки, где-то нет. Давай красиво сделаем пожалуйста

> [Screenshot: Projects: «+ New project», Algebra, Calculus, Discrete mathematics, each with a
> bare «0» at the right.]

Я не знаю что здесь за 0, добавь слово tasks хз
При «улетучивании» таски после клика как выполненного иногда уже «скрывшеяся» карточка таски мерцает и появляется обратно. Нехорошо
Плюс чуть сократи время после окончания анимаии до начала сдвигания всех остальных элементов

> [Screenshot: Now on a computer: sidebar (Pace, New task, Now…), «TUESDAY · OCT 13 / Now», the
> Inbox counter «0» top right, the composer «Add a task or paste a message ⌄», a task «123 ·
> Personal · Normal · 2d 6h old».]

У нас две кнопки в Inbox. Давай с Now уберем, оставим ток в сайдбаре. Там еще будет круто каунтер показывать для количества неразобранных задач
Еще можно брать имя из профиля тг, хранить его в профиле и показывать в статусе. Типа в сайдбаре сверху Pace, а справа имя из профиля – Albert
Напомню что совершенно ок дропать всю базу если нужно. Давай ее дропнем даже чтобы не приходилось данные мигрировать и какие-то корнер кейсы учитывать 

## The extra screenshot

Sent in chat after the document.

> [Screenshot: Dark theme: Now with the composer form expanded (Check before adding, Create
> Enter with a white focus ring, Title «asdasd», Category Homework, Importance Normal, «Nov 8
> 23:59», «1h by category», Description «adsadadasd», Link), the time bar pinned below, and a
> toast «Type something first.» lying over the Rest and Sport buttons.]

еще такой фидбек. что ему здесь не нравится? и опять же почему мы такое не ловим на этапе QA
