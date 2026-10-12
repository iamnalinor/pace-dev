# Feedback round 2 («pace замечания 2», 2026-10-10)

The user's second feedback document, verbatim as text. Screenshots are replaced by their
descriptions in [brackets]. A caption follows the screenshot it is about. What was done about
each point is in `plan.md` (Stage 6).

Мелкие фиксы:

Иконка приложения как будто чуть великовата и не оч отцентрована, надо как с тг ботом сделать

Недавние выбранные активности? Хз зачем надо убери. Хочется чтобы каждая кнопка была доволньо большой (чтобы точно не промазать) и всегда находилась в своем месте

Шрифт везде одинаковый, даже русский должен быть на Inter.

> [Screenshot: the sidebar header — the Pace logo (a gray chevron, a lime chevron and a dot) and the word «Pace» on the light background.]

Тут иконка с фоном сливается

> [Screenshot: task page, «Progress 0 / 10» card — a thin bar between a «−» and a «+» button.]

Блять ну что это. Я просил чтобы как в переключателе громкости условно можно было перетащить и прогресс проставить.

> [Screenshot: «Why it's 3rd on Now» card — Pace; Work: Progress 0%, Work left 1h; Time: Hours left 3d 11h; Importance: Normal ×3, Your rank in Normal 2 of 4, Rank bonus 0.05; Result: Urgency 0.26, Score 0.84; formula «0.25 + 1h / max(3d 11h, 0.5) = 0.26».]

Крч давай уберем всю нашу умную логику. Задачи ранжируем по времени до дедлайна, и все. Умные политики докрутим потом

> [Screenshot: Now list (light theme) — filter chips «All», «Algebra»; rows «hw Algebra 123 124» (Algebra · 1d 21h old), «25 октября дедлайн СОП» (Personal · 1d 20h old, Russian text in a serif font), «Домашнее задание №2 по «Безопасность жизнедеятельности»» (Homework · Due Tue Oct 13 23:59 · 3d 11h left · 36% behind pace, with a pace bar under it); a «Waiting» divider and a long Russian homework text as a waiting row.]

Вот эти вот Waiting тоже.

Плашки сливаются с фоном, аналогично. Я вообще не вижу тегов срочности, они должны быть после проекта. Из Due убираем день недели. 36 behind pace тоже убираем, темп не трекаем. Все лишнее из кода убери

> [Screenshot: the «Original message ↓» toggle on the task page.]

Некорректная иконка. У ката другая стрелочка вниз

> [Screenshot: the time bar — «What are you doing?» field, recent-label chips («25 октября дедлайн СОП», «Sport», «Food»), category chips Work ⌄, Study ⌄, Food, Commute, Rest, Sport; a «+» button floating to the right between the field and the chips.]

Че тут кнопка плывет?

> [Screenshot: task page header — back chevron, a gray «No project» pill with a chevron sitting lower than the pill.]

А тут? Почему это плашка? Проект на странице задачи (В пикере) не должен выглядеть как плашка

> [Screenshot: task page — «36% of window gone» with a progress bar.]

Это тож убираем

Inbox открывает страницу где пропадает левый сайдбар. Настройки тоже. History просто пустую страницу открывает/ https://pace.nalinor.dev/project/01M4D35VZMCPRD8GFE0G9AKZ74 тут тоже. Почему такое вообще происходит?

How Now is ordered

Tasks are sorted by score: importance × urgency. Urgency grows as the deadline nears and as the work left outgrows the time left.

Это соответственно убираем вообще

При появлении плашек с затемнением почему-то «затемненная часть» тоже всплывает, в итоге полсекунды верхная часть светлая а остальное темное

---

Смотри. У меня вот такие основные сценарии использования. Для каждого в плане тебе нужно написать: либо мы закрываем сценарий полностью (с хорошим UI/UX), либо частично, либо никак. Второе и третье, очевидно, нужно фиксить – опиши, как. Подключай плагин Superpowers с гитхаба. Так же юзай продуктовое мышление – поищи в инете плагины на эту тему, мб они расскажут, как лучше делать

Этот файл целиком положи в context/ (в текстовом виде), чтобы потом можно было ориентироваться

Тасктрекер:

Каждую неделю есть ДЗ по алгебре, матану, дискре, Введение в программирование (Normal), ОРГ + история (nice to have). На каждое ДЗ существует созданная таска, поэтому я вижу свой план даже если не вкинул новое дз в чат.

Когда ДЗ приходит, я вставляю его в поле быстрого ввода (дальше – ПБВ). Система автоматически 1) маппит задачку к ближайшей невыполненной, если не указан явный дедлайн, иначе маппит к дедлайну 2) разбивает на подзадачи в системе 3) проставляет описание, вытаскивает ссылку и проставляет ее. Часы (сложность) берутся из парамертов регулярной задачи, если в тексте не сказано иного

Могут приходить и нерегулярные задачи. Соответственно мы тут маппим к проекту и проставляем аргументы, если выводится из контекста, или дефолтим.

Иногда я вбиваю текст просто руками. Щас прогон эйайем запускатся автоматом после N секунд неввода текста, наверное это не очень токен эффективно. Я хочу видную кнопку чтобы я понимал как автоматически превратить ПБВ в форму таски – т.е. при своем вводе генерация из ПБВ запускается вручную (но вставку можно детектить в целом). ПБВ и форма таски должны отличаться в UI, чтобы не получалось ситуаций, когда текст для ПБВ автоматом превратился в длинное название

У задач существует время начала (которое блять видно в UI). Если не сказано явно, ставится время создания. Если время начала в будущем, то мы не отображаем задачи сразу, скорее просто скрываем под кат типа «In future».

Таймтрекер:

На главной снизу есть несколько кнопок, которые позволяют мне выбрать вид активности. Некоторые из них сразу запрашивают дополнительные детали, некоторые нет. Долгим нажатием (правым кликом на пк) я могу указывать детали. Эстимейты / лимиты Крч кнопки такие:

From calendar (к событию автоматом/в фоне подсасывается событие из календаря, название активности меняется на то что в календаре – допустим дейлик или пара)

Rest. Эстимейт 30мин

Sport. Открываем пикер по времени: 30мин 1ч 2ч 3ч

Chores. Тут открываем пикер и выбираем: Getting ready, Eating, Commute, нагенерь еще вариантов – крч вся рутина тут

Там, где стоят эстимейты, спустя 2x от ожидаемого времени мы кидаем уведомление «а вы точно все еще этим занимаетесь?»

Там вроде какие-то лимиты были. Давай их уберем, чтобы не усложнять

А, ну да, сценарии. Я просыпаюсь, тремя кликами быстро (приложение, Chores, Getting ready) проставляю себе статус и иду собираться. Когда собрался, захожу в приложение и протыкиваю Commute – предыдущий статус снимается, если я не указал, что занимаюсь двумя вещами параллельно (лонгтапом или правой кнопкой мыши – но для пикера дополнительного можно и три точки добавить мб)

Я пришел в вуз, снимаю Commute. В целом некоторые слоты без затреканного времени будем считать что ок. Перед парой я захожу в приложение, оно подсасывает события из календаря телефона (важно – ток те, на которые я согласился), видит что у меня начинается пара и спрашивает, затрекать ли ее (а-ля Attend / Skip). Если Attend, то в историю активности эта встреча автоматически добавляется – с соответствующим началом и концом

У меня появилось дело которого нет в списке но хочу записать его. Я захожу в аппку, тыкаю в поле кастомного ввода (окей для активности можно отдельное можно сделать), ввожу «Пошел в ЦСС, 20мин» и отправляю. Сразу начинается какая-то активность, а гпт осс в фоне ее парсит и проставляет названия «Пошел в ЦСС» и эстимейт в 20 минут

Начал делать ДЗ. Зашел в тасктрекер (на главной он сверху), тыкнул на таску и нажал Focus.

> [Screenshot: task page header icons — pencil, pause, trash.]

> [Screenshot: task page footer — a stopwatch icon button, an hourglass icon button and the lime primary (Done) button.]

Нахуя нам две кнопки паузы? Убери вторую, а первую подпиши как Focus – верни текст. Пусть Focus и Done одинаковое количество места занимают

> [Screenshot: project page «Algebra» — stats card Open 0 · On time 1/1 · Late 0, «No tasks here yet.», then «Done» with a plain text line «hw Algebra 123 124 · Done».]

Почему я не могу никак вернуться к done таске на странице проекта? Почему они отображаются как-то по другому? Это неконсистентно. Список тасок проекта должен быть похож на просто список тасок, просто мы показываем Open сверху (в порядке убывания дедлайна) и Done в порядке их дедлайнов

Дальше. Я хочу трекинг своего времени и синк календарей. Календарь синкается в облако (это можно отключить с телефона), и я могу открыть что-то вроде календаря на неделю в браузере – увидеть свой календарь, увидеть затреканные активности – т.е. буквально чем я занимался всю неделю

Трекинг времени – хочу чтобы базово просто все затреканное время со всех устройств (андроид – через приложение, linux mint / ubuntu / другие пк – мб просто через скрипт, где возможно) синкалось в облако, и аналогично я мог видеть агрегированную статистику по тому а что я вообще делал в своих устройствах. Важно чтобы инфа дальше названий приложений не уходила с устройства (но желательно чтобы таймслоты начала/конца времени уходила, чтобы потом проведенное время в приложениях можно было маппить на активность). Соответственно в активностях мы показываем а где мы сидели во время этой активности. Никаких штрафов за сидение не делаем, просто сами по себе хотим это видеть – и там уже потом сами думать. Это все есть в том числе и в MCP

Почему я не могу отредактировать в своей таске ровно ничего? Ни время начала (котоорго нет), ни время конца, ни ожидание по времени. В редактировании должна быть возможность отредактирвоать все это

## Scenario coverage before stage 6

Written while planning stage 6 (full / partial / none), see `plan.md` (Stage 6) for the fixes.

| # | Scenario | Before stage 6 |
|---|---|---|
| T1 | Weekly homework exists as tasks ahead of time | Partial: instances exist, empty ones hidden in «+ N later» |
| T2 | Pasted homework maps to the nearest open instance or the explicit deadline, subtasks, description, link, hours from the preset | Partial: always the nearest instance, typed due/estimate dropped, LLM description dropped |
| T3 | Irregular task: project and fields from context or defaults | Partial |
| T4 | Manual typing: AI on a visible button, paste detected, quick input differs from the task form | None: auto-read 700 ms after a pause |
| T5 | Start time visible and editable, future starts under «In future» | None in the UI |
| T6 | Edit start, due, estimate and the rest | None: title and description only |
| T7 | Project page like a task list, Done reachable | Partial: Done is plain text |
| T8 | Focus from a task | Partial: icon without text, an extra Waiting button |
| A1 | Chores → Getting ready in three taps | Partial: no picker, small shifting buttons |
| A2 | New activity ends the previous one; parallel by long press / right click / ⋯ | Partial: no parallel, no right click on the web |
| A3 | Rest 30m, Sport 30m–3h, «still doing it?» at 2×, no limits | Partial: reminder at 1×, phone only, limits exist |
| A4 | Accepted calendar events: Attend / Skip before they start | Partial: only on Day, afterwards, no status filter |
| A5 | From calendar names the activity after the current event | None |
| A6 | «Пошел в ЦСС, 20мин» starts at once, the LLM names it in the background | Partial: raw label only |
| W1 | Calendar synced to the cloud, week view in the browser | None |
| W2 | App time from every device in the cloud, «where I sat» per activity, in MCP | None: phone-local only, messenger penalty |

## Scenario coverage after stage 6 (PR #38)

| # | Now | Where |
|---|---|---|
| T1 | Done: empty weekly instances are ordinary rows by their due; a course with no open instance gets its next week's one ahead (under «In future»), and a week whose deadline passed before the course was added is skipped | Now list, `compareNowItems`, `recurrence/hw-instances.ts` |
| T2 | Done: nearest open instance, or the one the due names (else a task of its own); subtasks, description, link, estimate | `input/compose.ts`, task form «Add to …» |
| T3 | Done: the form shows the guessed project and fields, all editable | composer form |
| T4 | Done: Parse button or paste only; Enter adds a short line; the form is a separate step | `composer.tsx`, `composer-form.tsx` |
| T5 | Done: start in the form and the edit sheet; later starts fold under «In future» | Now, project page |
| T6 | Done: every field in the edit sheet, start and due can be cleared | `EditTaskSheet` |
| T7 | Done: Open / In future / Done rows, done tasks open | project page |
| T8 | Done: `[Focus] [Done]` footer, no Waiting | task footer |
| A1 | Done: four fixed buttons, Chores → picker | time bar |
| A2 | Done: switching closes the main one; long press, right click or ⋯ → «Alongside what is running» | time bar, `activity.started.alongside` |
| A3 | Done: Rest 30m, Sport 30m–3h; «Still doing this?» at 2× in the bar, a phone timer and the bot; limits removed | `paceStatus`, `long-run.ts` |
| A4 | Done: own and accepted events only; Attend / Skip on Now from ten minutes before; a phone reminder at the start | `calendar-filter.ts`, `CalendarPrompt` |
| A5 | Done: From calendar starts the event going on now under its title, from its start | `startCalendar` |
| A6 | Done: starts at once with the length as Expect; `POST /api/parse/activity` relabels it in the background | `startTyped`, `refineActivity` |
| W1 | Done: the phone sends its calendar (toggle in Settings → Devices); `/week` in the browser | `calendar_events`, Week |
| W2 | Done: phone and computers (ActivityWatch bridge) send app sessions; «where I sat» on Day and Week; MCP `get_usage`, `get_week`; no penalties | `usage_sessions`, Devices |

## Product references found while planning

- Simple Time Tracker (open source, F-Droid): start/stop on long press as an option, a sticky running notification.
- ActivityWatch: the established open-source collector of active-window time on Linux (X11; Wayland via awatcher), Windows and macOS, with a local REST API — Pace bridges from it instead of writing its own watcher.
- Android `CalendarContract.Instances.SELF_ATTENDEE_STATUS`: the user's own response to an event (accepted / declined / tentative / invited / none).
- Tools used: the Superpowers skills (writing-plans, test-driven-development, systematic-debugging, verification-before-completion) as the working method.
