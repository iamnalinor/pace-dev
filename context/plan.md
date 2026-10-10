# Pace — task & time tracker: implementation plan

Spec: Claude Doc «Трекер задач и времени — требования» (tabs: requirements, Стек).
Design: canvas «Tracker — app screens» (8 phone screens, 390×844, dark, Geist + Geist Mono,
bg `#0b0b0c`, surface `#141416`, raised `#1c1c1f`, text `#ececee`, muted `#8a8a93`, accent
`#d4ff3a`, project colors `#7aa2ff/#b49cff/#6fd49a`, warn `#ff8a5c`, question `#f2c14e`).
Logo: canvas «Pace — logo options», board 08 «Step» (two chevrons + dot; lime favicon tile).

## Stage 6 plan (current — feedback round 2; 2026-10-10)

Approved by the user in Russian; kept as written. The document itself is `feedback-2.md`.

### Контекст

Второй документ с фидбеком: 13 мелких замечаний к вебу (11 скриншотов) и сценарии использования
(тасктрекер, таймтрекер, календарь, учёт времени на устройствах). Просьбы пользователя:
- исправить всё;
- по каждому сценарию сказать, закрыт ли он полностью, частично или никак, и описать, как доделать;
- подключить Superpowers;
- поискать продуктовые плагины и подходы;
- положить файл целиком в `context/`;
- после работы запустить агента на Sonnet: пусть прокликает веб, найдёт всё странное и неудобное, и это тоже исправить.

Решения, принятые в этом раунде:
- **Кнопки трекинга.** Ровно 4: From calendar, Rest, Sport, Chores. Work и Study трекаются через Focus на задачах.
- **Сбор времени на ПК.** Мост из ActivityWatch.
- **Календарь.** Берём принятые события и свои события без приглашения (расписание, подписки). Отклонённые, «может быть» и без ответа не берём.
- **Страница проекта.** Ближайший дедлайн сверху.

Порядок работы:
- работаю в ветке этой сессии, как обычно;
- PR'ы по очереди от свежего `main`, каждый доводится до зелёного CI, влит merge-коммитом, деплой проверен;
- в конце релиз APK актуального `main` со следующим тегом (`v0.7.0`; последний был `v0.6.0`). Ничего недоделанного за ним нет — это просто новая версия с этими изменениями;
- никаких id моделей в коммитах и PR;
- `bun lint` после каждого изменения, TDD.

Названия веток из `context/` убираю: `README.md`, `plan.md` и `user-messages.md`, включая строки про `claude/sweet-ramanujan-xtto1q` и `claude/stoic-goodall-26jj51`. Это детали прошлых сессий, а не договорённости.

Работаю по схеме Superpowers: план → TDD → systematic-debugging для багов → verification-before-completion. Карточка установки показана. Пока плагин не установлен в сессию, следую этим навыкам вручную (тексты прочитаны с github.com/obra/superpowers).

### Почему так плохо: найденные корневые причины

1. **Пустые страницы.**
   - `t()` бросает исключение на отсутствующем ключе (`packages/core/src/i18n/i18n.ts:22`).
   - History запрашивает `event.activity.*` (`history-screen.tsx:28`, через `as MessageKey`), а таких ключей нет. Значит, любой аккаунт с трекингом времени получает исключение.
   - Error boundary в приложении нет, поэтому падает всё дерево.
   - e2e это не ловили: тестовые аккаунты пустые.
2. **Сайдбар пропадает.**
   - Сайдбар — это `tabBar` у `(tabs)` (`app/(tabs)/_layout.tsx:27`).
   - Inbox, History, Settings, `/project/*`, `/task/*` — соседние экраны корневого Stack. `router.push` накрывает весь навигатор вместе с сайдбаром (`tab-bar.tsx:158-178`), и каждое нажатие кладёт новую копию в стек.
3. **Русский текст шрифтом с засечками.** Шрифт на самом деле Geist, только латиница (226 глифов). В `tailwind.config.js:24` нет фолбэка `sans-serif`.
4. **Затемнение «всплывает» вместе с листом.** `Modal animationType="slide"` (`ui/sheet.tsx:31`) двигает и подложку тоже.
5. **Плашки и иконки сливаются с фоном.** В светлой теме:
   - surface/bg 1.09:1, линии 1.19:1;
   - контуры чипов 1.6–2.5:1;
   - лаймовый шеврон логотипа на фоне 1.06:1;
   - тёмная «дорожка» иконки на тёмном фоне 1.74:1.
6. **Процесс.** Скриншоты смотрели на пустых сидах и латинице. Контраст светлой темы не проверялся. Сценарии пользователя не проигрывались целиком.

**Почему тесты это не ловили.** Тесты писались «на фичу»:
- каждый e2e берёт свежий пустой аккаунт ради изоляции;
- проверяет только путь, который строился в этот момент;
- никакой тест не обходит все экраны на данных, похожих на реальные;
- ни один не падает на ошибке в консоли браузера;
- а ключ `t(\`event.${type}\` as MessageKey)` спрятан от typecheck приведением типа.

То есть пробел в самой стратегии, а не случайный пропуск. Что меняем, чтобы такой класс ошибок ловился системно:
1. **Обход всех маршрутов** (`e2e/route-sweep.e2e.ts`):
   - один «обжитой» сид-фикстур: кириллица, курсы с экземплярами ДЗ, проекты, done-задачи, все типы событий, включая активности и правки;
   - тест открывает **каждый** маршрут из `apps/app/app/**` (список собирается из файлов, новый экран попадает в обход автоматически) прямой загрузкой и переходом из навигации, на 1440 и 390 px;
   - падает на любой `pageerror` или `console.error`, на пустом `body`, на отсутствии сайдбара на широком экране;
   - плюс axe.
2. **Полнота переводов.**
   - Unit-тест: для каждого значения перечислений с динамическими ключами (`EVENT_TYPES`, исходы, срочность, категории, статусы) есть ключ в EN и RU.
   - Lint-правило (`no-restricted-syntax`) запрещает `as MessageKey`: динамические ключи только через типизированные карты.
3. **Jest.** Рендер каждого экрана на том же сид-состоянии (без ошибок рендера).
4. **Ошибки.** Error boundary; `t()` никогда не бросает исключение.
5. **Контраст.** Тест на ≥ 3:1 для границ, чипов и иконок в обеих темах (WCAG 1.4.11).
6. **QA-агент на Sonnet** после каждой волны — ловит то, что тесты проверить не могут: «неудобно», «странно».
7. **`docs/testing.md`.** Правило: новый экран или тип события обязан попасть в сид обхода (тест 2 это и так проверяет).

### Сценарии: насколько закрыты сейчас и что доделать

| # | Сценарий | Сейчас | Что сделаем (PR) |
|---|---|---|---|
| T1 | Еженедельные ДЗ по курсам существуют заранее как задачи, план виден даже без нового ДЗ | **Частично**: экземпляры `hw:<preset>:<week>` создаются, но пустые прячутся в «+ N later» | Пустые экземпляры показываются в общем списке по дедлайну; будущий старт уходит в свёрнутое «In future» (B) |
| T2 | Вставил ДЗ в быстрый ввод → привязка к ближайшему открытому экземпляру (или к явному дедлайну), подзадачи, описание, ссылка; часы из пресета | **Частично**: всегда идёт в ближайший экземпляр, явный дедлайн и оценка игнорируются, `description` от LLM выбрасывается, ссылка только regex'ом, в промпте нет курсов и экземпляров | Промпт и маппинг доделываем (B) |
| T3 | Нерегулярная задача → проект и параметры из контекста или умолчание | **Частично**: есть, но форма не видна как форма | (B) |
| T4 | Ввод руками: генерация по видной кнопке, вставка детектится, быстрый ввод ≠ форма задачи | **Никак**: авторазбор через 700 мс после паузы, единое поле с чипами | Две разные зоны «Быстрый ввод» и «Форма задачи» (B) |
| T5 | Время начала видно и редактируется; по умолчанию время создания; будущее — под катом «In future» | **Никак** в UI (поле в модели есть) | (B) |
| T6 | Редактирование задачи: старт, дедлайн, оценка и всё остальное | **Никак**: только название и описание | Полная форма редактирования (B) |
| T7 | Страница проекта как обычный список: Open сверху, Done ниже, done можно открыть | **Частично**: Done — некликабельный текст, «No tasks here yet» при наличии Done | (B) |
| T8 | Focus на задаче → трекинг | **Частично**: кнопка-иконка без текста, рядом лишняя «Waiting» | Footer `[⏱ Focus] [Done]` поровну (A) |
| A1 | Утро: приложение → Chores → Getting ready (3 клика) | **Частично**: Chores без пикера, кнопки мелкие и прыгают | 4 крупные кнопки на фиксированных местах, пикеры (C) |
| A2 | Сменил активность → предыдущая закрывается; параллельно — лонгтапом, ПКМ или «⋯» | **Частично**: замена есть, параллельных нет, ПКМ на вебе не работает | (C) |
| A3 | Rest 30 мин, Sport 30м/1ч/2ч/3ч; на 2× от ожидания «точно ещё этим занимаешься?»; лимиты убрать | **Частично**: напоминание на 1×, только Android, лимиты есть | (C) |
| A4 | Перед парой: приложение видит событие (только принятые) → Attend/Skip → событие попадает в историю с началом и концом | **Частично**: Attend/Skip есть только на Day и после события, без фильтра по статусу | Карточка на Now в момент начала + уведомление (C) |
| A5 | From calendar: активность получает название текущего события | **Никак** | (C) |
| A6 | Своё дело «Пошёл в ЦСС, 20мин» → старт сразу, LLM в фоне ставит название и оценку | **Частично**: старт с сырым текстом, без LLM | (C) |
| W1 | Календарь синкается в облако (отключаемо с телефона), в браузере неделя: события + затреканное | **Никак** | (D) |
| W2 | Время во всех приложениях со всех устройств (Android + Linux) в облаке, только названия приложений и таймслоты; у активности видно «где сидел»; без штрафов; в MCP | **Никак**: Android считает локально, ничего не отправляет; ПК нет; есть штраф за мессенджеры | (D) |

### PR A — мелкие фиксы и удаление «умной» логики

**Оболочка веба**
- **Постоянный сайдбар.** Корневой `app/_layout.tsx` на широком экране рендерит `Shell = Row(Sidebar, Stack)`; у `(tabs)` на широком экране свой tabBar скрыт.
  - Sidebar ведёт по `usePathname` (подсвечивает активный пункт).
  - Переходит через `router.navigate`, а не `push`, чтобы стек не копился.
  - Settings на широком экране не модалка.
  - На телефоне всё как было.
- **Ошибки.**
  - `ErrorBoundary` на корне (expo-router `export function ErrorBoundary`): «Something broke», текст ошибки, кнопка «Reload».
  - `t()` на отсутствующем ключе возвращает ключ, в dev — предупреждение.
  - Добавить ключи `event.activity.*` в EN и RU.
  - Тест в `i18n.test.ts`: у каждого `EVENT_TYPES` есть ключ `event.<type>`.
- **Пустой `/project/<id>`.** Воспроизвести в e2e на обжитом аккаунте (прямая загрузка и переход из Projects), найти причину по консоли и исправить. Тест остаётся как регрессия.
- **Шрифт Inter везде.**
  - Веб: woff2-сабсеты latin, latin-ext и cyrillic в `public/fonts` с `unicode-range` в `global.css`, preload.
  - Android: `@expo-google-fonts/inter` в плагине `expo-font`.
  - `tokens.json`: `sans = Inter`, фолбэк `system-ui, sans-serif`.
  - Моно-шрифт убираем, цифры набираем Inter с `tabular-nums`, чтобы «шрифт везде одинаковый». Классы `font-mono` → `font-sans tabular-nums`.
- **Лист (Sheet).** `Modal animationType="none"`. Подложка — reanimated `FadeIn`/`FadeOut`, панель — `SlideInDown`/`SlideOutDown`, с учётом reduced motion. Лист монтируется постоянно, чтобы отыгрывалась анимация закрытия.
- **Контраст светлой темы.**
  - Токены `line`, `track`, `raised`, `bg` и контуры чипов затемнить: для светлой темы свои «ink»-оттенки цветов проекта.
  - Тест в `contrast.ts`: ≥ 3:1 для контуров, тегов и иконок к фону в обеих темах.
  - Теги (`ColorTag`) — заметная заливка и цветной текст ≥ 4.5:1.
- **Логотип и иконки.**
  - `PaceMark` в светлой теме — цвета светлого варианта (`#b9bcc6` / `#17181c`), в тёмной — более светлый серый.
  - `scripts/generate-icons.ts`: марку центрировать по bounding box. Foreground адаптивной иконки ≈ 0.37 ширины, как видимая доля аватарки бота. Дорожка контрастная. Перегенерировать PNG.
  - Сделать отсутствующий `assets/favicon.png` или указать на `favicon.svg`.
- **Шевроны.** «Original message» с `ChevronDown`/`ChevronUp` (lucide), как остальные раскрывашки. Стрелки убрать из i18n.
- **Проект в шапке задачи.** Не плашка, а текст цвета проекта и шеврон, выровненные по центру. Причина съезда — `self-start` в `ColorTag` (`ui/color.tsx`); вариант тега без `self-start`.
- **Кнопка «+» в тайм-баре.** Уходит вместе с редактором кнопок (см. PR C). До PR C её нужно выровнять по полю.

**Удаление умной логики** (события в логе остаются парсящимися, редьюсеры старые события игнорируют или нормализуют)
- **Удаляем:**
  - `packages/core/src/urgency/*`, `queries/urgency-input.ts`, `queries/window.ts`, `isCompeting`;
  - `explanation`, `rank`, `windowElapsed` в `task-view.ts`;
  - клиентские `why.ts`, `why-text.ts`, `rank-actions.ts`;
  - в приложении `why-card.tsx`, `now-help.tsx`, `draggable-row.tsx`, `reorder.ts`, `use-move-task.ts`, `importance-edge.tsx`, `format/numbers.ts:ordinal`;
  - пресетные `urgencyPolicy` и `notify.criticalScore` (схема продолжает принимать, UI убираем);
  - MCP: `set_rank`, score и explanation из `get_task`/`list_now`/`rows.ts`, `simulate` с перерасчётом ранга. `simulate` остаётся только для правил уведомлений, если что-то остаётся, иначе удаляется вместе с `SimulatedRank`.
  - Ключи i18n, доки (`docs/mcp.md`, `docs/presets.md`, README), тесты.
- **Waiting.**
  - Статус убираем из UI, MCP `set_status` и уведомлений (`stuck waiting`).
  - Редьюсер нормализует старый `waiting` → `in_progress`.
  - Кнопка Hourglass удаляется.
- **Сортировка Now** (новый `compareNowItems` в `queries/now-item.ts`):
  - `dueAt` по возрастанию;
  - задачи без дедлайна — после всех, по `createdAt`;
  - задачи с `startAt > now` — в отдельной секции `future` (свёрнута, «In future · N», `ChevronDown`);
  - пустые hw-экземпляры — обычные строки.
  - Уведомление «критично по score» убираем, по дедлайну остаётся.
  - Дайджест берёт верх списка по новому порядку.
- **Строка мета.**
  - Порядок: `Проект · [Срочность] · Due Oct 13 23:59 · 3d 11h left`.
  - Тег срочности показывается всегда, включая «Обычная», нейтральным цветом.
  - День недели из Due убираем: `formatRelativeDay` без `weekday` (ещё и в `notify-text.ts`). Тесты `i18n.test.ts:229` обновить.
  - «behind pace» и полоса темпа под строкой — удалить.
- **Страница задачи.**
  - Убрать why-карточку и «% of window gone».
  - Footer: `[⏱ Focus]` с текстом (в фокусе — `[■ Focusing]`) и `[Done]`, `flex-1` каждая.
  - В шапке остаются карандаш, пауза и корзина.
- **Прогресс как слайдер.** `ui/slider.tsx`:
  - дорожка с бегунком, `Gesture.Pan` и тап по дорожке (gesture-handler/reanimated уже есть), шаги 0..10;
  - на вебе стрелки ←/→ и `role="slider"`, `aria-valuenow`;
  - на Android `accessibilityRole="adjustable"`;
  - событие `task.progress.set` отправляется при отпускании.
  - Кнопки −/+ убрать.

### PR B — тасктрекер: быстрый ввод, форма, редактирование, проект

- **Быстрый ввод и форма задачи — разные вещи.**
  - Быстрый ввод (ПБВ): многострочное поле «Вставь или напиши…» и видная кнопка `✨ Разобрать`.
  - Автоматический LLM-разбор по паузе удаляем (`useAutoAiRead`, `AUTO_READ_DELAY_MS`).
  - Вставку детектим и сразу запускаем разбор: на вебе `onPaste`, на Android скачок длины ≥ 20 символов за одно изменение. Share intent работает так же.
  - Короткая однострочная строка по Enter создаёт задачу по правилам, как сейчас.
  - Длинный или многострочный текст по Enter не становится названием, а запускает разбор.
  - Результат разбора, или кнопка «Заполнить вручную», открывает **форму задачи** — отдельную карточку с подписанными полями: Название, Проект, Категория, Срочность, Старт, Дедлайн, Оценка, Подзадачи (список с удалением), Описание, Ссылка, «Добавить в: Алгебра 41» (если выбран экземпляр).
  - Форма редактируема, «Создать» / «Отмена».
  - Исходный текст сохраняется как source.
- **LLM.**
  - В `shared/llm/prompt.ts` добавить пресеты с повторением (курсы `hw.*`) и их открытые экземпляры (id, дедлайн, оценка).
  - В `parse/schema.ts` — поле `link`, `target` (id экземпляра или null).
  - `description` прокидывается через `parseToQuickInput` → `ComposerEdits.description` → `ComposerExtras`.
- **Маппинг ДЗ** (`input/compose.ts openInstanceOf` + `composer-actions.ts addToInstance`):
  - нет явного дедлайна → ближайший открытый экземпляр этого курса;
  - явный дедлайн → экземпляр с этим дедлайном, иначе новая задача с этим дедлайном;
  - оценка: из текста, иначе из экземпляра или пресета;
  - `addToInstance` применяет подзадачи, описание, ссылку и указанную оценку (сейчас только подзадачи и source).
- **Старт.**
  - По умолчанию время создания (`createdAt`), показывается в форме и на странице задачи.
  - Будущий старт → секция In future на Now (PR A).
- **Редактирование задачи.** Вместо `EditTextSheet` — та же форма задачи в режиме редактирования: название, описание, проект, категория, срочность, старт, дедлайн (с очисткой), оценка (с очисткой), ссылка.
  - Схема: `task.updated` допускает `dueAt`/`startAt: null` (очистка), как сделано для `description`. Редьюсер обновить и написать тесты.
  - Используются существующие `updateTask`, `setEstimate`, `setImportance`, `setPreset`, `setProject`.
- **Страница проекта.**
  - Open по дедлайну, ближайший сверху (тот же компаратор), задачи будущего старта — внизу под «In future».
  - Затем секция Done — те же `TaskRow` (отмеченные, кликабельные, переоткрываются из задачи), по дедлайну, последние сверху.
  - «No tasks here yet» только когда пусто всё.
  - Карточку Open/On time/Late оставить, но с нормальным контрастом.

### PR C — таймтрекер

- **Модель** (`packages/core/src/tracking/`):
  - **Кнопки.** Фиксированные 4 в `buttons.ts`:
    - `calendar` — From calendar;
    - `rest` — ожидание 30м;
    - `sport` — пикер 30м / 1ч / 2ч / 3ч;
    - `chores` — пикер: Getting ready, Eating, Cooking, Commute, Shower, Cleaning, Laundry, Groceries, Dishes, Errands, Nap, Other. Каждый пункт со своим ожиданием, Commute 45м.
  - Food, Commute и Hygiene становятся пунктами Chores; старые категории в событиях продолжают парситься.
  - Пользовательские кнопки (`activity.button.set`/`removed`) и `ButtonEditor` убираем; события игнорируются редьюсером.
  - **Лимиты удаляем полностью** — все места из разведки:
    - `expect-limit.ts` (`paceStatus` limit-ветки), `notify/limit.ts`, `local-notifications.ts`;
    - в `time-bar.ts` `PACE_STATUS_TEXT`, `time-forms.ts`, `day.ts`;
    - MCP `start_activity.limitMinutes`, `notify-text`, `analytics`, i18n, тесты, доки.
    - `limitMinutes` в payload по-прежнему принимается для старых событий, но не используется.
  - **Параллельные активности.**
    - `activity.started` получает `alongside?: true`: такая активность не закрывает основную, а основная её не закрывает.
    - `closeRunning` и `trimOverlaps` учитывают это.
    - `runningActivities` возвращает основную и фоновые.
    - В суммах по дням считается только основная.
    - Property-тест на независимость от порядка.
  - **Штраф за мессенджеры** (`countedMinutes`, `messengersOnPurpose`) удаляем.
- **UI** (`shared/tracking/time-bar.tsx`, переписан):
  - Поле «Чем занят?» и кнопка ▶ рядом — ровно в одну строку с одинаковой высотой. Чипы недавних меток удаляем.
  - Под полем сетка из 4 крупных кнопок (min 56 px, иконка и подпись):
    - на телефоне 2×2;
    - на широком экране 4 в ряд;
    - всегда на одних и тех же местах; запущенная — с заливкой.
  - Тап на Rest — старт с заменой текущей. Тап на Sport или Chores — компактный пикер вариантов; выбор стартует.
  - Лонгтап, правый клик (`onContextMenu` на вебе, `preventDefault`) или маленькая «⋯» в углу кнопки открывают лист деталей: название, ожидание, переключатель «Параллельно с текущей», Start.
  - Над полем — запущенные активности (основная и фоновые), каждая: метка, время, «из ~30м», ✏ и ■ Stop.
- **Своё дело** («Пошёл в ЦСС, 20мин»):
  - Enter сразу стартует активность с сырым текстом. Правила (`input/quick-spans`) сразу вырезают длительность в ожидание.
  - В фоне `POST /api/parse/activity` (новый эндпоинт в `endpoints.ts`, тот же провайдер gpt-oss / Gemini, ротация ключей) возвращает `{label, expectMinutes?, category?}`.
  - Клиент дописывает `activity.labelled` и `activity.adjusted`. Ошибка LLM оставляет сырой текст.
- **Напоминание на 2×.**
  - Android: локальное уведомление на `start + 2×expect` «Ты всё ещё: Sport?» с действиями «Да» и «Стоп» (категории действий expo-notifications).
  - Веб: Notification API, если разрешено (спросить в Settings), иначе баннер в приложении при возврате.
  - Напоминание на 1× убираем.
- **From calendar и Attend/Skip.**
  - Источник событий (`calendar-source`): на Android — телефонный календарь; на вебе — облачная копия из PR D.
  - Фильтр в `phone-calendar.ts`: `Instances.SELF_ATTENDEE_STATUS ∈ {ACCEPTED}` или событие без участников и без приглашения (свои/подписки). Отклонённые, «может быть» (tentative) и без ответа не берём. Тест на маппер.
  - Тап «From calendar»: если идёт событие, старт активности с названием события, началом в момент события (если уже идёт) и ожиданием до конца события. Если нет — лист с ближайшими событиями сегодня.
  - Карточка на Now за 10 минут до начала и до конца события, если решение не принято: «Алгебра 10:00–11:30 · Attend / Skip».
    - Attend пишет `activity.logged` с началом и концом события. Timeline показывает блок как текущий, пока идёт, и закрывает в конце события.
    - Skip скрывает. Правила на серию («всегда»/«никогда») остаются.
  - Android: локальное уведомление в начале события с тем же выбором.

### PR D — облако: календарь, неделя, время на устройствах, MCP

- **Календарь в облако.**
  - Новый эндпоинт `POST /api/calendar/sync {from, to, events[]}`: заменяет события диапазона. Таблица `calendar_events` в Durable Object, `bun db:generate`.
  - `GET /api/calendar?from&to`. `DELETE /api/calendar` при отключении.
  - Android выгружает окно −7…+14 дней при старте, при возврате в приложение и в фоновой задаче.
  - Переключатель «Синхронизировать календарь» в Settings → данные телефона, по умолчанию включён.
- **Время на устройствах.**
  - Новый эндпоинт `POST /api/usage/sessions {deviceId, deviceName, sessions[{app, startAt, endAt}]}`: идемпотентно по `device+app+startAt`, таблица `usage_sessions`.
  - `GET /api/usage?from&to`.
  - Отправляются только название приложения и интервал, без заголовков окон.
  - Android: сессии из UsageEvents (`phone-data.ts`) ≥ 1 мин, выгрузка вместе с календарём.
- **ПК (Linux Mint / Ubuntu, а также Windows и Mac через ActivityWatch).**
  - `tools/pace-aw-bridge/pace_aw_bridge.py`: Python 3, только stdlib. Тесты на `unittest` идут в CI unit-джобе.
  - Скрипт читает REST ActivityWatch (`localhost:5600`, бакеты `aw-watcher-window_<host>` и `aw-watcher-afk_<host>`):
    - оставляет только `app` и время, вне AFK;
    - склеивает соседние события в сессии;
    - шлёт на сервер с курсором в `~/.config/pace/`.
  - Systemd user timer раз в 5 минут.
  - Токен устройства: в Settings «Подключить компьютер» создаёт сессию с меткой `device` и показывает команду установки один раз. Есть список устройств с отзывом.
  - Инструкция в `docs/desktop.md`: AW на X11, на Wayland через awatcher.
- **«Где сидел» у активности.** На Day и в деталях активности — приложения со всех устройств, пересекающиеся с интервалом активности: топ по минутам, с иконкой устройства. Без штрафов.
- **Неделя.**
  - Новый экран `/week` в сайдбаре и в табах на телефоне.
  - 7 колонок × часы: события календаря (контур), затреканные активности (заливка цветом категории или проекта), тонкая полоса использования устройств. Тап или ховер — детали.
  - Навигация `[Today] [‹] [📅] [›]` как на Day.
- **MCP.** `get_calendar(from,to)`, `get_usage(from,to,device?)`, `get_week(from,to)` (активности с «где сидел»), `docs/mcp.md`.

### После PR A–D: исследовательский QA (Sonnet) и PR E

- Агент `general-purpose` с `model: "sonnet"`, в фоне.
  - Поднимает стек как e2e: wrangler dev + `build:web`, `serve:web`, `EXPO_PUBLIC_DEV_LOGIN=1`.
  - Заполняет обжитой аккаунт: русские ДЗ из документа, курсы, проекты, done-задачи, активности, параллельная активность.
  - Через Playwright проходит каждый маршрут и все сценарии T1–T8, A1–A6, W1–W2:
    - 1440 и 390 px, светлая и тёмная темы;
    - лонгтап и ПКМ, клавиатура, повторная загрузка каждого URL;
    - консоль браузера на ошибки.
  - Отчёт: проблема, шаги, скриншот, серьёзность — в `context/qa-round-1.md` (скриншоты в scratchpad).
- Я разбираю отчёт, чиню в PR E (TDD) и запускаю агента второй раз на исправленной сборке. Повторяю, пока не останутся только мелочи; мелочи тоже чиню.

### Документы

- `context/feedback-2.md`: документ целиком текстом, на месте картинок — их описания. Плюс таблица «сценарий → статус».
- `context/user-messages.md` и `context/plan.md`: этот раунд и решения.
- `docs/architecture.md`, `docs/mcp.md`, `docs/presets.md`, `docs/desktop.md`, README — обновить.
- Найденные продуктовые ориентиры записать в `context/feedback-2.md`:
  - Simple Time Tracker — старт по лонгтапу, липкое уведомление;
  - ActivityWatch — сбор времени на ПК;
  - Android `CalendarContract` `SELF_ATTENDEE_STATUS`.

### Проверка

- **Каждый PR:**
  - `bun lint` (exit 0), `bun test:unit`, `bun test:api`, `bun test:app`, `bun test:e2e`;
  - новые e2e: каждый пункт сайдбара на обжитом аккаунте (сайдбар виден, нет пустой страницы), прямая загрузка `/history` и `/project/<id>`, быстрый ввод → разбор → форма → создание, Focus, 4 кнопки, ПКМ, параллельная активность;
  - Playwright-скриншоты 390 и 1440 px в обеих темах на кириллице, просмотренные до пуша;
  - тест контраста токенов.
- **CI и деплой.** CI зелёный (Android APK job dispatch для PR C и D). Деплой: `/api/health`, веб 200, на проде `/history` и `/project/<id>` открываются.
- **Мост с ПК.** `python3 -m unittest` для моста; ручной прогон моста против мок-ответа AW.
- **В конце.**
  - Релиз `v0.7.0`.
  - Чек-лист для телефона: иконка, календарь (принятые), Attend/Skip-уведомление, напоминание 2×, синк в облако, неделя в браузере, «где сидел».
  - Для ПК: установка ActivityWatch и моста.

## Stage 5 plan (done — dependabot PRs + the feedback document; 2026-10-08)

### Context

The user asked: (1) sort out the open PRs, (2) apply every remark from the feedback document
(27 remarks over 15 screenshots of the web: due labels, Now/Waiting, task page, "Why it's on
top", log-past dialog, time bar, toasts, Day page, composer chips, presets, task menu, SW
updates, animations, and "everything said about the web applies to the app — keep them in
sync"). Answers taken: **web moves to react-native-web** (one UI codebase for Android and web),
**Errands merges into Chores**. Working agreements from `context/`: one thread, no subagents;
plans are not sent for approval; PRs from fresh `main`, driven
to green, merged with a merge commit, deploy verified, APK released via `release.yml` dispatch
(`v0.x`, never `v1.0.0`); no model ids in commits/PRs. Record this round in
`context/user-messages.md` and `context/plan.md`.

### Part 1 — open PRs (all dependabot)

| PR | Finding | Action |
|---|---|---|
| #16 lucide-react 1.51→1.52 | green, mergeable; matches the app's lucide-react-native 1.52 | merge (merge commit) |
| #14 lint group (@eslint-react 5.24.4, better-tailwindcss 4.8) | red only because its base is stale: the failure is the urgency property-test float flake already fixed on main by `50bed4a` | `update_pull_request_branch` → CI green → merge. If bun.lock conflicts, apply the bump on my branch (`bun install`, `bun lint`) and close #14 as superseded |
| #13 expo group → SDK 58 | SDK 58 is still npm `next` (latest = 57.0.27); the PR moves half the SDK (jest-expo, expo-font… stay 57) → jest can't resolve `@react-native/assets-registry`, eslint can't find `expo/tsconfig.base` | close with a comment; `dependabot.yml`: ignore semver-major for the expo group (SDK upgrades by hand with `expo install --fix` once 58 is stable) |
| #15 jest 30, @types/jest 30, test-renderer 1.3 | green, but jest-expo 57 depends on Jest 29 internals (babel-jest/jsdom env ^29) — the documented decision is "jest-expo 57 (Jest 29)" | close with a comment; ignore semver-major of `jest`/`@types/jest`; take test-renderer 1.3.0 on my branch |
| #17 @types/node 22→26 | runtime is Node 22; v26 types advertise APIs that don't exist there | close with a comment; ignore semver-major of `@types/node` |

The `dependabot.yml` change rides in PR A. Comments carry the Claude Code footer.

### Part 2 — three PRs, one release

The PRs are merged one after another (each green, deployed); a single APK release `v0.6.0`
is cut after PR C, not one per PR.

#### PR A — shared logic (core + client), both current UIs pick it up

TDD in `packages/core` / `packages/client` (`bun test:unit`), then wire both UIs minimally.

1. **Time formats** (`core/src/i18n/i18n.ts`, EN+RU):
   - `formatDue`: "Today 23:59" / "Tomorrow 23:59", otherwise the exact date "Thu Oct 13 23:59"
     (year only if different); never a bare weekday. Zone suffix only when it differs from the
     viewing zone — fixes the composer chip (`apps/web/.../composer/field-chips.tsx:44`, app
     `composer.tsx`) which always appends it.
   - `formatSpan(minutes)` with floor rounding: > 1 month → "1mo 5d"; > 7 d → "12d"; > 1 d →
     "6d 12h"; > 1 h → "12h 34m"; else "34m". Used for "6d 12h left" next to Due (new
     `left` field in `now.ts duePart` / task view), "3d old" (`agePart`, replaces "0 days old";
     under a day it shows hours/minutes), overdue "2d 3h late", and Hours left in the why card.
   - Eyebrows: full weekday ("Thursday · Oct 8"); Insights eyebrow becomes the week range
     "Oct 5 – 11" (no "Week of Mon"), computed in the account zone.
2. **Now list**: `core/queries/now-list.ts` + `client/view-models/now.ts` return one ordered
   list: active rows, then waiting rows with a `divider` marker only when both groups are
   non-empty (no fold). New `nowHelp` strings for a "?" sheet explaining the sections (score =
   importance × urgency; Waiting = waiting on someone, urgency frozen; Later = start in the
   future or homework not assigned yet; Paused stays in the list).
3. **Progress rule** (`core` task view): a task with subtasks tracks subtasks (and only then
   per-subtask submission and its "Subtasks" badge); a task without subtasks gets the 0–10
   progress bar, whatever the preset's mode (except `none`). The "Submit per problem" tag
   disappears when there are no subtasks.
4. **Why card**: `explain.ts` / `client task.ts whyRows` → grouped sections (Work: progress,
   work left · Time: due in, hours left · Importance: Normal ×3, rank 2 of 2, rank bonus ·
   Result: urgency, **score**) and the formula as segments with values substituted
   (`0.25 + 1h / max(130h 15m, 0.5h) = 0.26`), values flagged so UIs render them in the
   accent mono font.
5. **Presets are editable defaults** (`core/src/presets/`): `preset.updated` accepted for base
   ids (stored as an override layer on the built-in definition, incl. name/color),
   `preset.archived` accepted for base ids except `inbox` (hidden from pickers, tasks keep
   resolving; revocable from History). New `order` field; default order Homework, Work,
   Personal, Deferred; composer/editor sort by `order`, not by name. Palette gains `orange`
   and `yellow` (muted, contrast-checked in the tokens test): Personal orange, Work violet,
   Homework yellow, Deferred slate, Inbox teal. Update `docs/presets.md`, the reducer tests,
   client `preset-actions.ts` (drop `preset/built-in` for update/archive).
6. **Quick input**: "hw", "дз", "домашка", "homework" pick the Homework preset (or the
   best-matching user preset extending `hw`, e.g. "hw algebra" → `hw.algebra`) and the keyword
   is removed from the title (`queries/suggest.ts` `PRESET_OF_FAMILY.hw`, `parse-quick-input.ts`).
7. **Time tracking model** (`core/src/tracking/`):
   - `errands` folds into `chores`: the payload enum still parses old events, the reducer
     normalizes to `chores`; the category disappears from pickers.
   - Default buttons: drop Sleep (sleep comes from screen-off detection; the `sleep` category
     stays for detected/logged sleep). Buttons get `askDetails` (default on for Work and
     Study) → tap opens the details sheet instead of starting blind.
   - `tapButton` applies the learned median like `startActivity` (current quirk).
   - Details suggestions view-model: Work → open Work-preset tasks; Study → open Homework tasks
     + today's calendar classes (app, from observations); plus recent labels; free text.
   - Day rows / running row expose `expectText` ("of ~30m", "limit 1h") and end "now" for a
     running block; the label tag is omitted when the label equals the category name.
   - Shared time-mask helper (`client/view-models/time-forms.ts`): digits → "HH:MM", auto ":",
     signals "move to end field" after start minutes; log-past defaults the day to the viewed
     day (today) and asks only for times.
8. **No more toasts**: client actions stop returning success/undo toast texts; undo lives in
   History (exists). Errors go to an inline error banner component per UI.

#### PR B — web on react-native-web: `apps/app` becomes the one UI

- Expo web (`expo export --platform web`, Metro, NativeWind 4.2 works on web). Platform files
  `*.web.ts` in `apps/app/src/platform/`: IndexedDB event store (move
  `apps/web/src/platform/idb-event-store.ts`), localStorage session, device id, api base,
  theme (`prefers-color-scheme`), Excel export (move `platform/xlsx.ts`), Telegram Login
  Widget + return page; phone data, background tasks, local notifications, DND → no-ops.
- Port the web-only screens to RN (`app/` routes + `src/screens/`): presets list + editor
  (`apps/web/src/features/presets/*`, logic already in client), OAuth authorize page +
  connected apps, settings parts the app lacks (export, account zone/language), share target.
  Responsive layout: phone = bottom tabs; ≥ 1024 px = sidebar + list/detail panes (current
  web desktop layout).
- PWA: manifest/icons/share_target in `apps/app/public/`; `scripts/build-web.ts` runs the export
  then `workbox-build generateSW` (navigate fallback, denylist `/api`, `/oauth`,
  `/.well-known`); `src/platform/sw.web.ts` registers it and, when a new worker is waiting,
  shows a top banner "We changed a few things — Reload" (postMessage skipWaiting → reload),
  like olympagg.github.io.
- Deploy: `pace-web` wrangler config moves to `apps/app/wrangler.web.jsonc` (assets
  `./dist`, SPA fallback); `deploy.yml` builds via the new script. e2e: Playwright webServer
  serves `apps/app/dist`; selectors move to roles/labels/testID (`data-testid`); axe stays.
- Delete `apps/web`; port its RTL tests that have no app counterpart to RNTL (jest-expo);
  update `docs/architecture.md`, `docs/testing.md`, `CLAUDE.md` (drop `#web/*`/shadcn rules),
  knip, dependency-cruiser, eslint, stryker (web → app), README.

Done as planned, with these differences: the web build's tree shaking is on (Metro would
otherwise ship every lucide icon: 5.6 → 3.3 MB, ~730 KB gzipped); fonts are the two Latin
variable files only; app states go through `aria-*` props (react-native-web ignores
`accessibilityState`): chips and segments are radios, time-bar activities switches, the row
check a checkbox; presets can be moved in the pickers (`movePreset`); projects got client
actions (`createProject`/`updateProject`); lateness drops minutes from an hour on and never
shows them for soft deadlines (user request, `formatLate`).

#### PR C — the redesign from the document, once, in the unified UI

One design language from tokens; no `bg-inverse` black surfaces in light theme; shared chip,
button, icon-button, dropdown, calendar, sheet primitives in `apps/app/src/ui/`.
- **Chips**: unselected = default surface + thicker (2 px) colored outline; selected = color
  fill; neutral chips (Normal, open field chips) selected = raised surface + 2 px fg outline,
  never black. Preset chips in the new order and colors.
- **Composer**: deadline chip "Thu Oct 13 23:59"; deadline panel = themed calendar + masked
  time input, zone line only when it differs; estimate as a compact dropdown on desktop.
- **Now**: waiting rows inline under a divider; "?" help sheet; due rows "Due Thu Oct 13
  23:59 · 6d 12h left"; age "3d old".
- **Task page**: header = project dropdown (popover with search + new project), preset
  dropdown, icon buttons pencil (edit), pause, trash (confirm); no actions menu, no big Pause
  button (footer: Focus · Waiting · primary). Progress bar when no subtasks; why card grouped,
  formula with substituted values.
- **Time bar**: a "What are you doing?" field (free text, recent labels) + compact
  auto-width chips (not a full-width row of 8 on desktop); tap starts, `askDetails` buttons
  (highlighted with a chevron) open the details sheet (title, link to task / class, Expect,
  Limit); chevron / long press opens it for any button. Running row: label, elapsed, "of ~30m"
  or "limit 1h" with progress. No toasts.
- **Log past activity**: day chip (today) + masked "14:05 → 14:35" inputs with auto-advance;
  categories without Errands/Sleep clutter.
- **Day**: nav cluster `[Today] [‹] [📅] [›]` with Today on the left, always occupying its
  slot (disabled on today) so arrows never move; 📅 opens the themed month calendar (days
  with tracked time marked); rows vertically centered, pencil icon instead of "Edit",
  "14:06 – now", expected/limit shown, no "[Food] Food".
- **Animations** (reanimated, works on web): list enter/exit + layout transitions on Now and
  Day, chip/button press scale, sheet/popover slide+fade, running-row pulse, progress-bar
  tweens; respects reduced motion.
- **Web↔app parity going forward**: one codebase; plus a parity e2e that screenshots Now,
  Task, Day at 390 and 1440 px in both themes on the same seed.

#PR C as built: chips and segments outlined (filled when chosen, never black); the composer's
due and estimate are chips opening a themed month calendar with a masked time, or a list;
Now has a "?" help sheet; the task header carries edit / pause / delete icons (no menu, no
big Pause); the time bar has "What are you doing?" (`startTyped`), compact buttons, and a
details sheet (task to link, recent labels) behind Work/Study and any long press; Day has
[Today] [‹] [calendar] [›], centered rows with "– now", Expect/Limit and a pencil, and no
"[Food] Food"; rows animate in and out, the running block pulses. Added on request: account
deletion (`DELETE /api/me`, Settings), which also gives every e2e test a clean account. Found
on the way: web sheets lost the theme (modals render outside the root): fixed in `Sheet`.

## Verification

- Every PR: `bun lint` exit 0; `bun test:unit`, `bun test:api`, `bun test:app`,
  `bun test:e2e`; Playwright screenshots at 390 and 1440 px, light + dark, of every touched
  screen, looked at before pushing (alignment, nothing shifting, no black surfaces in light).
- CI green on the PR (dispatch the Android APK job on the branch for PR B/C), merge commit,
  deploy healthy (`/api/health`, web 200, SW update banner seen after a second deploy),
  after PR C one release `v0.6.0` via `release.yml` dispatch, APK link checked.
- Part 1: #16 and #14 merged with green CI; #13/#15/#17 closed with reasons; dependabot
  ignores in place.
- User device checklist after PR C: time bar details flow and long press, Day calendar,
  log-past time entry, no toasts, animations.
</content>
</invoke>

Later in the session: breaking changes are welcome when they simplify; every composer line is
read by the LLM after a typing pause (drafts are not logged); several keys per provider rotate
on rate limits.

## Phase 1 completion plan (current — supersedes the old resume notes)

### Context

M0 and most of M1 are built, deployed (`pace.nalinor.dev`, `pace-api.nalinor.dev`) and on
the stage branch (HEAD `3079123`). Done and green: core (presets, tasks,
outcomes, urgency, recurrence, queries, review rules; 392 tests), client (actions,
view-models, hooks; 100), API (OAuth 2.1 + full MCP tool set, DO state/projections, webhook
IP allowlist; 186), web screens as a first draft (197 unit tests). The user tried the web
build and rejected its shape: on a PC it is just the phone UI in a narrow column with no
desktop layout at all, adding a task is clumsy, fields are confusing. This plan merges that feedback with everything still owed for phase 1,
then ships phase 1 as one PR to `main` (M0 + M1 together) and stops.

User feedback, decided here (mobile web and the app may differ, even a lot):
1. **Responsive web.** Today a PC simply shows the phone UI unchanged in a 430 px column.
   The desktop gets its own layout instead: from 1024 px a left sidebar
   (Now, Day, Inbox, Projects, Insights, Settings, "+ Add"), Now as two panes (list left,
   open task right, URL `/task/:id` still deep-links), project page two panes, sheets
   become dialogs or the right pane; 640–1023 px one wider column with top navigation;
   below 640 px the artboard phone layout. Keyboard: `j/k` move, `x` check, `n` focus
   the composer, `Esc` close pane, `?` shortcut help.
2. **One entry point.** A composer on Now (top on desktop, bottom bar on phone; the app gets
   its own native version) takes free text and shows parsed chips live: category (preset),
   project, importance, due (date + time + zone), estimate, link, problems ("1, 3, 5а").
   Enter adds the task; a second action sends the raw text to Inbox; an "expand" toggle
   reveals description and subtasks. Stage 1 parses with rules (core `parseQuickInput`,
   extending `suggestFor`: RU/EN weekdays, "завтра 18:00", "1ч/30m/полчаса", "срочно/asap",
   preset and project names, URLs); stage 2 swaps in the LLM behind the same interface.
   The separate Add page goes away (`/add` opens Now with the composer expanded; the app's
   share intent prefills it). User text is stored verbatim, never rewritten.
3. **Chips, not pickers.** Category and importance are one-tap chips like the estimate
   buckets (same compact `ChipGroup` component, smaller height/padding than today), also in
   the task edit dialog. No "Preset default" option anywhere: choosing a category preselects
   its default importance chip and the explicit value is stored on the task.
4. **Link instead of ticket.** `fields.ticket` becomes `fields.link` (URL) in core events,
   presets, view-models, web, app and MCP; the reducer keeps reading legacy `ticket` from old
   events (log stays immutable). If no link is set, the first URL in the composer text or
   the description fills it. Shown as a Google-Calendar-style link chip: favicon, page title,
   host; title from a new Worker endpoint `GET /api/link-preview?url=` (https only, public
   hosts, 64 KB / 3 s limits, `<title>`/`og:title`, cached with the Cache API).
5. **Colors.** Each category shows its preset color; importances get their own tokens
   (ASAP coral, Prioritized amber, Normal neutral, Nice-to-have slate) in both palettes with
   the existing contrast test; chips, Now rows and the task header use them.
6. **Time zone.** On the first signed-in load (web and app) a `settings.updated { timezone }`
   with the device zone is dispatched when the account has none; "Not set yet" and its key go
   away; Settings always shows a zone.
7. **Errors are explained.** `RouteError` shows what failed (status, message, error code)
   with Reload and Home; unknown routes get a real Not-found page (the `*` route currently
   renders `RouteError` without an error, hence "Something went wrong" on `/history`); action
   errors in toasts show their translated reason. The History page itself gets built.

Still owed for phase 1 regardless of the feedback: app screens (task screen composition and
its two red suites, inbox, projects/project, review, history, settings), web history page,
lint clean (~150 findings in the new UI files), e2e for the main journeys, design pass
against the artboards, code review, release.

### Execution (Opus agents, disjoint ownership, commit after every wave)

1. **Core + client** (one agent): `fields.link` with legacy `ticket` read; `extractLink`;
   `parseQuickInput(text, state, ctx)` → `{ title, presetId, projectId|projectName,
   importance, dueAt, dueTz, estimateMinutes, link, subtasks, spans }` (spans mark which text
   produced each chip, for highlighting) with RU/EN tests; client `composerModel` +
   `actions.createFromComposer`; importance color tokens + contrast test; `ensureTimezone()`
   action; i18n keys. Files: `packages/core/src/{events/payloads.ts, model/task.ts,
   model/preset.ts, presets/*, queries/suggest.ts, design/tokens.ts}`, new
   `packages/core/src/input/*`, `packages/client/src/{actions/*, view-models/*}`.
   In parallel **API** (one agent): link-preview endpoint (contract in
   `packages/core/src/api/endpoints.ts`), MCP `ticket` → `link`, finish docs. And **app task
   screen** (one agent): compose `apps/app/src/features/task/task-screen.tsx` from the parts
   already there, make its two suites and `apps/app` lint green.
2. **Web shell and pages** (one agent, owns `apps/web/src/layout`, `shared/**`, router,
   error pages): responsive `AppLayout` (sidebar / top nav / tab bar), two-pane Now and
   project, adaptive `Sheet` → dialog/pane, keyboard shortcuts, `RouteError` + `NotFoundPage`,
   History page, timezone bootstrap in `app-state.tsx`.
3. **Web composer and chips** (one agent, after 2): `features/composer/**` (input with
   highlighted spans, chip row, inline chip menus, inbox action, expand), `ChipGroup`
   compact variant, link chip, task edit dialog with chips and link, remove
   `features/add/**` and the Add page; then lint for `apps/web`.
4. **App** (one agent, after 1): native composer on Now, remaining screens (inbox,
   projects/project, review, history, settings), chips and colors, timezone bootstrap, link
   chip; `bun expo prebuild` still works.
5. **Gate** (one agent): `rm -rf .cache/eslint; bun lint` exit 0; `bun test:unit`,
   `bun test:api`, `bun test:app`; Playwright journeys at 390 and 1440 px in both themes with
   axe (login, compose → task on Now, check + undo, task pane, submit sheet/dialog, inbox
   triage, preset editor, history revoke, error pages); screenshots compared with the
   artboards (phone) and checked for desktop sanity; `/code-review` and its fixes.
6. **Release**: deploy API + web, PR → `main`, subscribe,
   CI green, merge commit, tag `v0.1.0` (APK on the GitHub Release), send the user the PR and
   release links, stop.

### Verification

- Unit: `parseQuickInput` table (RU/EN: "дз 7 по алгебре 1, 3, 5а до среды 23:59",
  "синк по дашборду завтра 15:00 1ч https://…", "срочно позвонить", plain text → inbox
  defaults); legacy `ticket` events still show as links; importance tokens pass contrast.
- Web e2e at 390 and 1440 px: composer creates a task with the expected chips in one Enter;
  changing a chip is one tap; link chip shows host and title; `/history` renders; an unknown
  route shows Not found; a forced render error shows its message; Settings shows a zone on
  first login.
- App: RNTL for composer and screens; `bun test:app` green; prebuild works.
- Production: after deploy, Playwright against `pace.nalinor.dev` (login page, CSP clean),
  `/api/health`, MCP `tools/list` includes `link`; CI green on the PR.


## Status (2026-10-07)

- Stage 1: PR #9 merged (merge commit 75d4fd2), deployed (`deploy.yml` re-run from the branch
  after the bot-token trim fix; health OK, webhook set). Tag `v0.1.0` must be pushed by the
  user (the session's git proxy refuses tag pushes).
- Stage 2: PR #18 open (head f8361a9): every CI check
  green (lint, unit, API, app, e2e, audit), mergeable `clean`, no reviews. Done — left
  unmerged as agreed; merging it deploys stage 2 (deploy.yml sets the LLM keys and webhook).
  Remaining duty: watch PR #18 events (safety-net check-in armed for 23:33 UTC), never merge.
- Next (needs the user's go): stage 3 (time tracking per "Stage 3 notes from the user"). Not done in stage 2 (left for later): LLM budget tracker/queue
  (`llm_queue`, `GET /api/llm/status`), inbox suggestions from parse, bot question buttons,
  per-task "why?" sheets.

## Stage 2 plan (current; after stage 1 is merged and deployed)

Delivery: a new PR from fresh `main`, driven to fully
green CI and **left unmerged** (user decision). Stage 1 stays deployed; stage 2 ready to deploy.
Plans are written here but not sent for approval (user decision).

Order (each step: tests first, `bun lint`, commit):
1. **Core parse**: `packages/core/src/parse/{schema,normalize,verify,apply}.ts` — flat zod
   schema (intent, create_task fields, add_to_task, mark_subtasks, close_task, questions,
   evidence); every extracted string must be a literal substring of the source (normalized
   compare), numbers/dates need evidence or become `doubtful`; `apply` → event inputs,
   reusing the composer's routing (HW instance, project on the fly). Regression cases in
   `parse/regression/cases/*.json` from the spec examples.
2. **API parse**: AI SDK with Groq (`openai/gpt-oss-120b`, strict json_schema) and Gemini
   fallback, `fake` provider for tests; prompt ≤ 3k tokens (asserted); budget tracker in
   the DO (`x-ratelimit-*`), interactive vs passive priority, `llm_queue` drained by alarm,
   `GET /api/llm/status`; `POST /api/parse` and `.../accepted`; decisions recorded.
3. **Composer + LLM**: the composer gets "Parse with AI" (and auto-parse for long or
   multi-line text): the LLM result fills the same chips, doubtful fields marked, question
   pills; the unavailable state ("LLM limit reached, back ~14:05 · Save to inbox and parse
   later / keep the rule-based chips"). Same in the app; inbox suggestions from parse.
4. **Telegram bot**: `/now` top 5; any text/forward → parse → preview with inline keyboard
   (Accept / To inbox / Cancel, question options); outage → queued; messages via `t()` in
   the account language.
5. **Notifications**: core `notify/{constants,rules,digest,schedule}` (windows 09/14/21,
   quiet hours, critical, stuck, snooze, retro suppression); DO alarm scheduler → bot;
   callback buttons; `GET /api/notify/plan`.
6. **Decision log**: DO `decisions` for parse, notifications, auto outcomes, digests;
   `GET /api/decisions`, MCP `search_decisions`, web/app decisions page and "why?" sheets.
7. **App local notifications** mirroring `/api/notify/plan` (pure scheduling fn in client).
8. Gate: lint, all suites, e2e with the fake LLM (incl. outage), PR green, not merged.

## Stage 3 plan (current — accepted without review at the user's request, 2026-10-08)

### Context
Stages 1–2 are merged, deployed and released (colors now drawn as tags). Stage 3 is the last:
time tracking. The user's brief: switching activity takes 1–2 taps; the main screen is tasks on
top and **time tracking at the bottom** (thumb reach); a grid of activity buttons — one tap
starts that activity and ends the previous one; every button carries defaults, a **long press**
edits them; same polish as the rest. Delivery: one PR from fresh `main`,
driven to green and **merged**, then deploy + release `v0.3.0`.

### Scope decisions
- In: the time ledger (events, timeline, expect/limit), activity buttons with defaults, focus
  on a task, the Day view (timeline, gaps, log past, adjust, stop), Insights (time by
  category/project per week, on-time rate, estimate vs tracked), MCP time tools, a Limit alert
  through the bot, app local notifications for Expect/Limit, phone calendar events on Day
  (read-only, `expo-calendar`, marked attended/skipped).
- Out (stated in the PR and README): phone-usage and sleep detection. They need a Kotlin
  module for UsageStats plus on-device verification that this environment cannot do; the event
  model leaves room (`activity.logged` with category `sleep` already covers manual sleep).

### Model (core, `packages/core/src/time/`)
- Events (immutable, in the same log):
  - `activity.started { activityId, label, category, taskId?, buttonId?, expectMinutes?, limitMinutes? }`
    — a new primary activity; whatever ran is closed at its `occurredAt`.
  - `activity.stopped { activityId }`.
  - `activity.logged { activityId, startAt, endAt, label, category, taskId? }` — retro block.
  - `activity.adjusted { activityId, startAt?, endAt? }`, `activity.labelled { activityId, label?, category?, taskId? }`.
  - `activity.button.set { buttonId, label, category, color, taskId?, expectMinutes?, limitMinutes?, order }`,
    `activity.button.removed { buttonId }`.
- Categories: work, study, task, food, commute, hygiene, rest, chores, social, sport, errands,
  sleep, other — each with a color and a default Expect/Limit (commute E45, food E30, hygiene
  L60, rest E30, else none).
- Default buttons (deterministic ids `btn:<category>`, seeded once): Work, Study, Food, Commute,
  Rest, Sport, Chores, Sleep.
- Reducer `time-reducer.ts` → `state.time { activities, buttons }`; derived:
  - `timeline(state, { from, to, zone, now })` → non-overlapping segments (a later start trims
    the earlier one; retro blocks split what they overlap), gaps > 15 min, running segment;
  - `dayTotals` by category; `taskTracked(taskId)`; `expectLimitOf(segment, now)` → status
    `ok | over-expect | near-limit | over-limit`; median-based default for a label from ≥3 past
    segments (falls back to the category default).
- Task reducer: `activity.started` with `taskId` touches the task (in progress) like `focus.started`.
- Validation: end after start, no future starts beyond tolerance.

### Client
- View-models: `timeBar` (buttons with running state, running activity, elapsed, expect/limit
  progress), `dayView(date)` (segments, gaps, totals, calendar events), `insights(week)`.
- Actions: `startActivity(buttonId | adHoc)`, `stopActivity`, `logPast`, `adjustActivity`,
  `relabel`, `saveButton`, `removeButton`, `ensureButtons`, `focusTask(taskId)`.

### Web
- Now: the **time bar** pinned to the bottom of the Now column (above the tab bar on phones;
  bottom of the list pane on desktop): running row (label tag, elapsed, Expect/Limit bar,
  Stop) + button grid (washed category color, filled when running); tap = switch; long press
  (500 ms pointer) or context menu = editor dialog (label, category, Expect, Limit, linked task,
  delete); "+" adds a button. Toast with Undo after a switch.
- Day page: date header with totals per category, timeline rows (time range, label tag, duration,
  task link), gap cards ("Log what happened"), edit sheet (adjust start/end, relabel), log-past
  form, calendar events from the app (observations) shown as attended/skipped suggestions.
- Insights page: week picker; bars of time by category and by project; on-time rate per project;
  estimate vs tracked for closed tasks. Charts per the `dataviz` skill, inline SVG/CSS bars.
- Task page: Focus button (starts an activity on the task), tracked time in the stats.

### App
- Same time bar at the bottom of Now (thumb zone), long press → editor sheet; Day and Insights
  tabs; Focus on the task screen; local notifications for the running activity's Expect and
  Limit (rescheduled on every switch); calendar events read with `expo-calendar` (permission
  asked from Day) and sent as observations.

### API
- Notifier: a running activity with a Limit gets a bot alert at the crossing (decision logged,
  once per activity), `nextAlarmAt` includes it.
- MCP: `start_activity`, `stop_activity`, `log_activity`, `get_day`, `summary_time` (by
  category/project over a range), `list_activity_buttons`.

### Verification
- Unit: timeline property tests (segments never overlap; totals equal the covered time),
  retro insertion cases, expect/limit statuses, defaults median; client actions/view-models;
  web RTL for the time bar (tap switches, long press opens the editor), Day and Insights; app
  RNTL for the bar and notifications scheduling; API: notifier limit alert, MCP tools.
- e2e (390 and 1440 px, both themes, axe): switch activities from Now, edit a button by long
  press, log a past block on Day, Insights renders.
- Gate: `bun lint`, all suites, PR CI green → merge → deploy healthy → release `v0.3.0` via
  `release.yml` dispatch.

## Stage 3b plan (current — phone data; accepted without review at the user's request, 2026-10-08)

Context: stage 3 shipped (`v0.3.0`) without phone usage, sleep and the phone calendar. The
user asked to build them, test as much as possible here, and then say what to check on the
phone. Delivery: a new PR from fresh `main`, green CI, merged, deployed, release `v0.3.1`.

Principles: phone data stays on the phone (screen and app events, calendar entries are read
on the device, never uploaded); only what the person confirms becomes an event
(`activity.logged`), so the log, sync and server stay as they are.

1. Core `tracking/phone.ts` (pure, tested): `PhoneEvent { at, kind: screen-on | screen-off |
   app-start | app-stop, app? }`; `screenOnIntervals`; `detectSleep(events, { now, zone })` —
   the longest screen-off stretch of at least 3 h that touches the night (21:00–12:00 local),
   with screen-on blips of up to 10 min merged (counted as wake-ups); `appUsage(events,
   { from, to })` — foreground minutes per app inside a window, largest first.
2. Native (Kotlin, `modules/pace-native`): `appLabels(packages)` → readable app names via
   PackageManager; usage events already exist. JS adapter maps Android event types (1/2
   activity resumed/paused, 15/16 screen interactive/non-interactive) to `PhoneEvent`.
3. App Day: (a) "Last night" card when usage access is on and a candidate exists: "Slept
   00:40–07:55 · 7h 15m · woke 2×" with Log sleep / Not sleep (dismissals remembered on the
   device); (b) each block shows the phone time inside it and the top apps; (c) "From your
   calendar" list for the day (expo-calendar, permission asked from Day) with Attended (logs
   the event as a block) / Skip (remembered on the device); events already logged show as done.
4. App Settings: "Phone data" rows with the state of usage access and calendar access and a
   button to grant each.
5. Tests: core unit (sleep across midnight, blips, too short, day naps ignored; app usage
   clipping), app RNTL with the native module and expo-calendar mocked; Kotlin compiled by a
   local `expo prebuild` + Gradle build if the toolchain allows, else by the CI Android job
   dispatched on the branch.
6. Then: README "what to check on the phone", PR, merge, deploy, release `v0.3.1`, and a
   checklist for the user.

## Product context in the repo (current — 2026-10-08)

### Context
The user wants every requirement discussed so far — the original spec (their long brief from
the start of the first chat) and everything decided since — committed to the repo, so a new
session understands the product without this chat. Today it lives only in the Claude Doc
«Трекер задач и времени — требования» (tabs «требования» and «Стек»,
https://claude.ai/artifact/4y4q2oqUsEboRLHaUKr1eN), in this plan file and in chat history.
The brief's literal chat text is not in this session's transcript (it starts from a summary);
the Claude Doc was written from it and is its complete form, so it is the source to commit.

### What to add (on the PR #23 branch, as one docs commit; or a follow-up PR if #23 is merged)
1. `docs/product/requirements.md` — the requirements tab exported verbatim (Claude Docs
   `export`, markdown, Russian), with a two-line header: source doc link, export date, and
   "the spec; where later decisions differ, docs/product/decisions.md wins".
2. `docs/product/stack-original.md` — the «Стек» tab verbatim, with a header listing what the
   build replaced (LiveStore → own push/pull sync; GramIO → grammY; Turborepo not used; SQLite
   WASM → IndexedDB on the web; Agents SDK McpAgent → `createMcpHandler`).
3. `docs/product/decisions.md` (English, the code language) — everything decided after the
   spec, distilled from this plan file and the chat:
   - user decisions: Expo + Vite, bot `@PaceTaskTrackerBot`, presets edited in the web UI,
     no Firebase, light/dark theme, EN/RU per account, user text never rewritten, time zones
     stored with every instant, MCP for Claude and ChatGPT with polished OAuth, debug-keystore
     signing for now, Telegram whitelist;
   - the "Spec open questions, decided here" list and the Decisions table (summarized, with
     links to `docs/architecture.md` instead of copying it);
   - user feedback that became rules: desktop layout of its own; the composer is the single
     entry point (LLM reading shown before adding); colors as tags/washes, never small dots or
     bars; Score shown as the total; "recorded" only when it differs; time tracking at the
     bottom of Now, one tap switches, hold edits defaults; check screenshots on desktop too;
     permissions explained before asking;
   - stage history with PRs and releases (v0.1.0 … v0.5.0), what is still not built and why
     (no v1.0.0 yet: "still not a finished product"; no real keystore; `GET /api/export`
     skipped);
   - working agreements for agents: Bun only, plans written but not sent for approval, one
     thread without subagents, PRs merged with a merge commit and released through
     `release.yml` dispatch (tag pushes are refused from sessions), never paste the bot token,
     no model ids in commits/PRs.
4. Pointers: one line in `CLAUDE.md` ("Product context: read docs/product/ first —
   requirements.md is the spec, decisions.md what changed since") and a link in README's
   intro.

### Verification
- `bun lint` (format check covers markdown? biome ignores .md — fine) passes; links resolve
  (`grep` the relative paths); the exported spec's section list matches the Claude Doc's 17
  sections («Зачем и принципы» … «Открытые вопросы»).
- Commit, push; CI green; merges with PR #23.

## Stage 4 plan (done — what the original plan still owed + permissions; 2026-10-08)

### Context
Stage 3b shipped (PR #21 merged, deployed, `v0.3.1` building). The user asked for (a) a
separate **Permissions** screen in the app's Settings and a **first-run micro-onboarding**
that says which permissions Pace will ask for and why, then asks; (b) everything the original
plan still owes: LLM limits with a deferred queue, background phone work, "end at last
unlock", calendar series rules, the messenger penalty, more analytics (productive hours,
fragmentation, focus vs sleep), Excel export, MCP `query_sql` / `simulate` / `export_all`,
README with screenshots. **No `v1.0.0`** — the product is not final; releases stay `v0.x`.
Work in one thread (no agents), plans are not sent for approval.

Delivery: two PRs from fresh `main`, each driven to green,
merged (merge commit), deployed; app releases via `release.yml` dispatch.
- **PR A — app: permissions, onboarding, phone extras** → release `v0.4.0`.
- **PR B — server + analytics: LLM queue, MCP analytics, insights, export, README** → `v0.5.0`.

### PR A — app
1. **Permissions model** `apps/app/src/platform/permissions.ts` (+ test): one list of
   `{ id: notifications | calendar | usage | exactAlarms, state: on | off | blocked,
   kind: dialog | settings }`; `request(id)` (notifications → `requestPermissionsAsync`,
   calendar → `requestCalendarAccess`, usage → `openUsageAccessSettings`, exact alarms →
   `paceNative.openExactAlarmSettings`; `blocked` → `Linking.openSettings()`);
   `usePermissions()` re-reads on AppState `active`. Reuses `phone-calendar.ts`,
   `phone-data.ts`, `modules/pace-native`.
2. **Notifications stop asking on their own**: `platform/notifications.ts` `hasPermission`
   only checks; asking happens in onboarding / Permissions.
3. **Permissions screen** `app/permissions.tsx` → `src/screens/permissions-screen.tsx`: each
   permission with what it is for, its state, one button. Settings: `PhoneDataRow` replaced by
   a "Permissions" row (summary "2 of 4 on") that opens it.
4. **Onboarding** `app/onboarding.tsx` → `src/screens/onboarding-screen.tsx`: step 1 lists
   the four permissions and why (Continue / Not now); then one step per permission not yet on
   (Allow / Skip; settings-type ones advance when the person comes back); done → flag
   `pace.onboarding.v1` in SecureStore, `router.replace("/")`. `(tabs)/_layout.tsx` redirects
   signed-in people without the flag to `/onboarding` (existing users see it once too).
5. **Background phone work**: `expo-background-task` + `expo-task-manager` (SDK 57.0.x);
   `src/platform/phone-background.ts` defines the task at module scope (imported from
   `app/_layout.tsx`), registered when usage or calendar access is on (min interval 30 min).
   It reads phone events and calendar, and posts a local notification once per item: last
   night's sleep candidate ("Slept 00:40–07:55 — log it?") and calendar events that ended
   without an answer ("Were you at …?"); a tap opens Day. Keys remembered in `phone-memory.ts`.
6. **End at pickup** (the plan's "trim to last unlock"): core `phonePickupAt(events, now)` —
   start of the current phone session (screen-on intervals merged across gaps < 2 min). Day's
   running row, when the activity is past its Expect and the pickup is after its start, offers
   "Ended at 14:32?" → `actions.adjustActivity` end + stop.
7. **Calendar series rules**: recurring events (expo-calendar `recurrenceRule`, series key
   `calendarId + title`) get "Every time" in the toast after Attended / Skip; rules stored on
   the device (`phone-memory.ts`); an `attended` rule logs ended events of that series when Day
   or the background task sees them, a `skip` rule hides them. Rules listed with remove in the
   Permissions screen's "Calendar" section.
8. **Messenger penalty**: core `countedMinutes(minutes, apps, { messengers, onPurpose })` =
   minutes − 0.25 × messenger minutes, `MESSENGER_PACKAGES` default (Telegram, WhatsApp, VK,
   Discord, Signal, Viber, Messenger, Slack); `activity.labelled` gets optional
   `messengersOnPurpose` (reducer + client action + toggle in the app activity sheet). Day's
   usage line on work/study/task blocks shows "counted 1h 40m" when it differs.
9. Tests: core unit (pickup, counted minutes, reducer flag), app RNTL (permissions screen,
   onboarding flow incl. settings-type step on AppState return, tabs redirect, background task
   function with mocked native/calendar/notifications, series rule toast), `bun lint`, suites.
   No Kotlin changes; the CI Android job is dispatched on the branch to build the new Expo
   modules (background task, task manager).

### PR B — server, analytics, export
1. **LLM limits + queue**: DO `meta` keeps per-provider `retryAt` from 429s; `runParse` skips
   providers known to be out until then. `GET /api/llm/status` → `{ available, retryAt }`
   (endpoint in `endpoints.ts`). DO table `llm_queue` (`id, text, channel, createdAt`; drizzle
   migration via `bun db:generate`); `POST /api/parse` with `defer: true` queues when
   unavailable. The DO alarm becomes `min(notifier next, queue retryAt)`; draining parses each
   item, logs the decision and sends the bot preview (existing preview / Accept flow); without
   a bot chat the result waits in decisions. Composer (web + app): on "limit reached" a
   "Parse when it's back" action (saves the line to Inbox and defers); bot outage path uses the
   same queue. API tests with the fake model's scripted 429s + `runDurableObjectAlarm`.
2. **Analytics in core** `tracking/patterns.ts` (+ tests): `productiveHours` (focus-category
   minutes by hour of day, account zone), `fragmentation` (per day: switches, median focus
   block, share of blocks < 15 min), `focusVsSleep` (per day: focus minutes vs sleep minutes
   of the night before, from logged sleep blocks). Client `insights` view-model extended;
   web + app Insights get three sections (hour bars, fragmentation row, paired bars) per the
   `dataviz` skill (thin bars, tags-not-dots, table fallback, both themes, validator run).
3. **Excel export** (web Settings → "Export to Excel"): `write-excel-file` in `apps/web`,
   sheets Tasks, Subtasks, Activities, Projects, Events; built from local state, downloaded.
4. **MCP analytics** (`apps/api/src/mcp/tools/analytics-tools.ts`): `describe_schema` (DO
   tables and columns), `query_sql` (`SELECT`/`WITH` only, no `;`/`PRAGMA`/`ATTACH`, wrapped
   `LIMIT 500`, run with `storage.sql` inside `transactionSync` that always rolls back),
   `simulate({ from, to, multipliers? })` (steps `nextAlarmAt` → `materializeAt` →
   `evaluateNotifications` over the range, ≤ 31 days / 500 steps, plus the Now ranking at `to`
   with the multipliers applied to `urgency`), `export_all` (NDJSON of events, paged by
   `since`); `GET /api/export` (NDJSON). Scopes `analytics:read`. Tests: write attempts leave
   no trace, simulate reproduces logged notification decisions on a fixture.
5. **README**: Playwright screenshots (web phone + desktop, both themes) into
   `docs/screenshots/`, status table updated (stage 4 items), still `v0.x`.

### Verification
- Each PR: `bun lint` exit 0, `bun test:unit`, `bun test:api`, `bun test:app`, `bun test:e2e`;
  CI green incl. the dispatched Android job; merge; deploy healthy (`/api/health`, web 200);
  release APK link checked.
- On the device (user checklist after PR A): fresh install → onboarding order and texts,
  each permission's system screen, Settings → Permissions states, a background sleep
  notification next morning, "Ended at …?" on an overrun activity, "Every time" on a
  recurring event.

## Stage 3 notes from the user (time tracking)

- Switching activity must take at most 1–2 taps. The main screen is split: task tracking
  on top, **time tracking at the bottom** (thumb reach). A row/grid of activity buttons;
  one tap starts that activity and ends the previous one; each button carries defaults
  (expect/limit, category); **long press** opens the editor to change them. Same polish
  as the rest of the design. Applies to the app first, then the web.
- Bot avatar: the dark app icon (done, `assets/logo/bot-avatar.png`).

## Context

Personal task & time tracker replacing Todoist for one user (Telegram ID whitelist, initially
`1919230638`), with room to invite a friend later. Later user additions on top of the spec:
light/dark theme (device default, overridable per device) and interface language EN/RU
(EN default, one per account); MCP usable from ChatGPT and other clients, not only Claude,
with a polished OAuth. Four channels: Android app (primary), web, Telegram bot, MCP. Three stages, each usable daily: (1) tasks/presets/urgency/Now,
(2) free-text input via LLM + bot + notifications + decision log, (3) time ledger, calendars,
sleep, phone usage, analytics. The repo holds a generic fullstack template (Bun workspaces,
Elysia + better-auth + Drizzle/Postgres, React + Vite + shadcn, Playwright) that we keep as
infrastructure (lint chain, test levels, conventions) and strip of everything app-specific.
Backend runs on Cloudflare Workers (free plan) at `pace-api.nalinor.dev`, web at
`pace.nalinor.dev`, APK published through GitHub Releases. The project must be open-source
ready.

User decisions already taken: Expo (React Native) for Android, web stays Vite + React; bot
`@PaceTaskTrackerBot` (token goes to secrets, never to chat); I may create Cloudflare resources
and deploy from this session; no Firebase — notifications via Telegram + local; **presets are
configured in the web UI, not in code** (so other people can use the project); the app only
consumes presets, no editor there.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Monorepo | Bun workspaces: `packages/core`, `packages/client`, `apps/api`, `apps/web`, `apps/app`, `e2e`. No Turborepo (add only if CI time hurts). | Spec: one TS logic everywhere. |
| Shared logic | `packages/core` = pure, immutable TS: events, materializer, presets, urgency, outcomes, parse schema + verification, timeline, notification rules, analytics, design tokens. No React, no I/O. | Same code on phone, web, Worker; property-testable. |
| Client layer | `packages/client` = local-first store (EventStore port, in-memory materialized state, outbox, sync client, view-models, actions) built on a vanilla zustand 5 store; React hooks exported from `@pace/client/react` (`react` as peerDependency, never `react-native`). TanStack Query only for server-only state (login polling). | Both UIs stay thin; one test suite for behaviour; zustand works identically in RN and DOM. |
| Mobile | Expo SDK 57 (RN 0.86, React 19.2 — the web keeps React 19.3 thanks to Bun isolated installs), expo-router, NativeWind v5 RC on Tailwind 4 (fallback NativeWind 4.2 + Tailwind 3), expo-sqlite, expo-calendar, expo-notifications (local only), expo-share-intent 8, expo-background-task, local Expo module `modules/pace-native` (Kotlin: usage stats, DND, exact-alarm permission). Package `dev.nalinor.pace`. CNG: `android/` gitignored; APK built in CI with JDK 17, NDK 27.1, arm64-v8a only, `versionCode` from the tag. **Signing for now: the standard Android debug keystore** (committed in `apps/app/keystores/debug.keystore`, the well-known `android`/`androiddebugkey` credentials) so every build has the same signature and installs over the previous one; its SHA-256 goes into `assetlinks.json`, so App Links work today. A real keystore is a later swap: add the four `ANDROID_*` secrets and the config plugin picks them up (users must reinstall once). | User decision ("random or default keys for now"); verified against SDK 57 docs. |
| Data model | Event sourcing: append-only immutable events with `occurredAt` (editable) and `recordedAt` (system). Corrections = `event.amended` / `event.revoked` (themselves revocable). State at date D = materialize events whose `occurredAt ≤ D`, corrections always applied. High-volume phone observations (usage, calendar) are **not** events: they live in `observations` tables and only derived facts (sleep confirmed, attendance) become events. | Spec: nothing lost, undo, retro edits, board at past date; keeps the log small. |
| Server storage | One SQLite-backed Durable Object per user (`UserStore`): `events`, `observations`, projection tables, `decisions`, alarms. D1: `users`, `sessions`, `login_nonces`. KV: `OAUTH_KV`. | Spec «Стек»; free plan; heavy recomputes inside the DO. |
| Sync | Own push/pull by server sequence (spec «Plan B»): client pushes outbox (idempotent by event id), pulls `since=seq`. Server clamps a future `recordedAt` to arrival time. No LiveStore. | Immutable events make sync trivial and testable. |
| Materialization | Incremental `apply` for in-order events; full re-materialize when an incoming event has `occurredAt` earlier than the last applied one or is a correction. Same rule in the DO. Budget: ≤ 50 ms for 20k events (measured in a test). | Retro edits recompute only when needed. |
| Client storage | Web: IndexedDB (`idb`); app: `expo-sqlite`. State in memory. | Simpler than SQLite WASM/OPFS; data fits memory. |
| Presets | Data, not code: `preset.created` / `preset.updated` / `preset.archived` events in the same log, so they sync to the app and the DO like everything else. Five built-in **base presets** (`hw`, `work`, `personal`, `deferred`, `inbox`) live in core as non-editable parents; user presets (courses etc.) extend them and are edited in the web Settings → Presets editor (zod-validated form, live preview). Example course presets are offered as a one-click seed on first login, not hardcoded. The app and MCP read presets from state; no editor there. | User decision; makes the project usable by others; inheritance and per-task overrides unchanged. |
| API framework | Hono 4.13 on Workers; typed client `hc<AppType>` consumed by `packages/client`. | Elysia's Workers adapter is experimental (no per-request `env`, top-level `.compile()`, no fake env in tests); Cloudflare's MCP/OAuth examples are Hono. |
| Schemas | zod 4 everywhere (events, presets, API validation via `@hono/zod-validator`, LLM output, env). TypeBox removed. | One schema library with first-class AI SDK + Hono support. |
| Hosting | API: Worker `pace-api` (custom domain `pace-api.nalinor.dev`). Web: Worker `pace-web` with static assets (SPA fallback, custom domain `pace.nalinor.dev`). | Pages is in maintenance mode; new `wrangler pages deploy` is delegated to Workers assets anyway. |
| Auth | Telegram only, whitelist `ALLOWED_TELEGRAM_IDS` (`wrangler.jsonc` var, value `1919230638`; other deployments edit the var). Web: Login Widget → `POST /api/auth/telegram` → bearer session. App: `t.me/PaceTaskTrackerBot?start=login_<nonce>` → bot binds nonce → app polls → token; return via `pace://` scheme now, https App Link once a signing cert exists. Dev/test login route only when `ENVIRONMENT !== "production"`. | Spec; cross-origin web/Worker/WebView favour bearer tokens over cookies. |
| OAuth widget domain | The bot has one widget domain (`pace.nalinor.dev`). The MCP `/authorize` page therefore lives on the **web** origin: API `GET /authorize` redirects to `https://pace.nalinor.dev/oauth/authorize?<original query>`; the web page runs the widget and POSTs `{ authQuery, telegramData }` to API `POST /oauth/complete`, which rebuilds the auth request, checks HMAC + whitelist, calls `completeAuthorization`, and returns `redirectTo`. | Resolves the `/setdomain` clash. |
| Bot | grammY (`webhookCallback(bot, "cloudflare-mod", { secretToken })`, `BOT_INFO` var). Minimal webhook (login deep link) ships in M0 so Android login works before stage 2. | Official Workers support; Android login must not wait for stage 2. |
| MCP | Client-agnostic: standard MCP streamable HTTP at `/mcp` via `createMcpHandler` from `agents/mcp/server`, behind `@cloudflare/workers-oauth-provider` 1.2 = OAuth 2.1 with PKCE S256, dynamic client registration, CIMD (`clientIdMetadataDocumentEnabled`, needs `global_fetch_strictly_public`), discovery at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`, refresh-token rotation, revocation; `accessTokenTTL: 86400`. Works with Claude (web/desktop/Code), ChatGPT connectors (callback `chatgpt.com/connector_platform_oauth_redirect`; `search` + `fetch` tools provided), Cursor, MCP Inspector. Scopes `tasks:read`, `tasks:write`, `time:read`, `time:write`, `analytics:read`, `offline_access`; tools declare required scopes and MCP annotations (`readOnlyHint`, `destructiveHint`). Branded consent page (client name, requested scopes, Telegram login, Allow/Deny) on the web origin; "Connected apps" settings page lists grants with revoke. Mutating tools take `at`/`precision` and `dryRun`. | User wants Claude-first but ChatGPT-compatible with polished OAuth; `McpAgent` is deprecated; KV free tier = 1k writes/day. |
| LLM | Vercel AI SDK 7 (`generateText` + `Output.object({ schema })`, `@ai-sdk/groq`, `@ai-sdk/google`). Default Groq `openai/gpt-oss-120b` (strict `json_schema`, `reasoningFormat: hidden`); fallback Gemini `gemini-flash-latest`; `fake` provider for tests. Groq free: 30 RPM, 1k RPD, **8k TPM** → prompt ≤ 3k tokens. Flat schema, optional = `T \| null`, no `additionalProperties`. Model picked by the regression set, results in `docs/llm.md`. **The LLM never rewrites user text**: source text is stored verbatim; extracted titles, subtask labels and details are copied as literal substrings in the input language (prompt rule + evidence verification), whatever the UI language. | Groq free + fast; spec: strict schema verified against source text; user: input stays in the language it was typed. |
| LLM budget | A per-provider budget tracker in the DO (`llm_budget`: remaining requests/tokens and reset times from `x-ratelimit-*` headers, plus local counters for Gemini). Two priority classes: **interactive** (someone is waiting: Add screen, bot message, MCP `parse_text`) and **passive** (inbox suggestions, activity classification, digest enrichment, re-parse). Passive calls run only above a reserve (30% of daily requests, TPM window not depleted) and are otherwise queued (`llm_queue`) and drained by alarm when the budget returns. Interactive on 429/empty budget: reset ≤ 20 s → wait and retry once; else switch provider; all exhausted → `llm_unavailable { retryAt }` and the UI/bot say so plainly ("LLM limit reached, back ~14:05"), offering "save to inbox, parse later" (queued, result delivered as a review item or bot message) or manual entry. `GET /api/llm/status` for the UI; every decision logged. | User: manage limits smartly, defer passive work, tell the user, fall back without the LLM when it will come back later. |
| Notifications | Server (DO alarm) decides everything and logs it; Telegram delivers digests/critical/stuck with inline buttons (snooze, outcomes, nudge/split/postpone/cancel). The app mirrors the DO's plan (`GET /api/notify/plan`) into local notifications for window reminders and schedules Expect/Limit timers locally; no local rules of its own. No FCM. | One source of truth; offline timers on the phone. |
| Design | Tokens in `packages/core/src/design/tokens.ts` with **dark and light** palettes (dark from the artboards; light from board 08's light variant: bg `#f4f5f7`, surface `#ffffff`, text `#17181c`, muted `#5c5e66`, lime kept for fills with dark text, darker lime `#6b8f00` for text/markers, contrast ≥ 4.5:1 checked in a test) → Tailwind v4 (`data-theme` variant) + NativeWind (`colorScheme`). Theme = per-device preference `system \| light \| dark` (web `localStorage`, app Preferences), default system. Geist/Geist Mono bundled. Logo 08 → favicon, PWA icons, adaptive icon. | User decision; one source of truth for both UIs. |
| i18n | `packages/core/src/i18n/` typed catalogs `en.ts` (source of truth) and `ru.ts`, `t(key, params)` with `Intl.PluralRules` and relative-time/duration formatters; a test asserts identical key sets. Language is an account setting (`settings.updated { language }`, synced; default `en`) used by web, app, bot messages, notification texts and LLM `questions`. It affects only the interface chrome: user-entered content (titles, labels, reasons, source texts) is stored and shown exactly as typed. MCP tool output stays English. Dates/times formatted per language. | User decision; supersedes the spec's "English only". |
| Time zones | Every absolute time a person sets (due, startAt, retro `occurredAt`, preset schedules) is stored as an instant **plus the IANA zone it was set in** (`dueAt`, `dueTz`). The account has a timezone setting (default: first device's zone). The due picker always shows the zone it will use; when the device zone differs from the account zone a banner offers a one-tap switch; task cards show "23:59 MSK (your time: 22:59)" whenever `dueTz` ≠ the viewing zone. Recurring HW instances use the preset's zone; "end of day" for ASAP uses the account zone. | User: no misunderstandings about deadlines across zones. |
| Tests | Vitest **4.1.x** (catalog-pinned; `@cloudflare/vitest-plugin` 1.3 needs it): core, client, web (RTL), api (workerd with real D1/DO/KV, `applyD1Migrations`, `runDurableObjectAlarm`). App: jest-expo 57 (**Jest 29**) + `@testing-library/react-native` 14 (+ `test-renderer`), run as `bun run test` (Node via shebang), `.bun` in `transformIgnorePatterns`. Playwright + axe: web e2e against `wrangler dev`. Stryker weekly on core + web. LLM regression on demand. | Template levels kept; Workers need workerd; Vitest cannot render RN. |
| Ids / time | `ulidx` `monotonicFactory()` (Workers clock is frozen within a request); `date-fns` 4 + `@date-fns/tz`. No Temporal. | Verified runtime caveats. |
| Removed from template | better-auth, Elysia/Eden/TypeBox, Postgres/postgres-js/Testcontainers, Docker/compose/nginx, example-posts, `bun test` for api, Postgres `db:check` (replaced by D1/DO drift checks). | Not needed on Workers. |

### Spec open questions, decided here

All constants live in `packages/core/src/urgency/constants.ts`, `.../notify/constants.ts`,
`.../time/constants.ts`, each with a comment; presets may override urgency/notify params.

- Implicit horizons: ASAP due = `min(explicitDue, endOfDay in the account zone)`; Prioritized
  due = `min(explicitDue, setAt + 3d)`. An implicit due is evaluated with the `pace` policy
  and the task's urgency is `max(u_policy, u_pace(implicitDue))`.
- One scale: every policy returns `u ∈ [0, 3]` with a shared floor `U_FLOOR = 0.25`;
  `score = multiplier × u + rankBonus`; ties broken by due ascending, then `createdAt`.
  `AGE_SAT = 0.4`, so an aged Nice-to-have (max `1 × 0.65`) never beats any Normal task
  (min `3 × 0.25`) unless it has a close deadline (then `pace`). Property-tested.
- Per-subtask submission at the final deadline: unsubmitted subtasks → `cancelled_missed`;
  the task → `cancelled_missed` (no partial outcome, per spec) with the on-time/late/missed
  breakdown in analytics.
- Automatic outcomes are applied, not proposed: when a hard/final deadline passes, the system
  emits `task.closed { outcome: cancelled_missed, source: system }` with deterministic id
  `auto:<taskId>:missed` (idempotent across devices/DO), logged in decisions, and the review
  block asks to confirm or undo. A later retro "done before deadline" wins (derived by time).
- Empty recurring HW instance (no subtasks/source/progress): hidden from Now (score 0), shown
  in the project page as "awaiting assignment"; at `due + 24h` auto-closed as `skipped`
  (`source: system`, reason "not assigned", revocable).
- Digest windows 09:00 / 14:00 / 21:00 local, quiet hours 23:00–08:00, timezone from
  `settings.updated` (default device tz). Digest "changes" = events with `recordedAt` after
  the last digest actually sent.
- Retro edits never notify: threshold/critical rules compare the state at the previous
  evaluation with the current one; a crossing caused by events whose `occurredAt` is before
  the previous evaluation is logged as `suppressed(retro)`.
- Routine categories: sleep, food, commute, hygiene, rest, chores, social, sport, errands
  with defaults (commute Expect 45m, food Expect 30m, hygiene Limit 1h, rest Expect 30m,
  global 30m). Similarity keys for median defaults: label, category, calendar series.
- Phone usage penalty: `countedMinutes = duration − 0.25 × distractedMinutes`; distracted =
  configured messenger packages unless the activity is flagged "messengers on purpose". No
  app taxonomy.
- Projects: a task belongs to at most one project; created on the fly by name from app, bot,
  MCP, parse.
- Submit semantics: `submission: whole` → the Submit/Done sheet emits `task.closed{done}`;
  `per_subtask` → `task.submitted{subtaskIds}`; submitting the last unsubmitted subtask closes
  the task in the same event (`closes: true`). Solved ≠ closed, always.
- Waiting: policy evaluated with `now := waitingSince` (freeze survives retro edits); waiting
  time accumulates per task.
- Evidence normalization for parse verification: lowercase, `ё→е`, Latin/Cyrillic lookalikes
  folded (`a/а c/с e/е o/о p/р x/х`), whitespace collapsed, dashes unified, numbers compared as
  tokens.
- Resubmission formula follows the spec piecewise (urgency can drop at `due` when the soft
  target starts); tests assert monotonic growth inside each piece, not continuity.
- Exchange calendar visibility can only be verified on the device; flagged in README.
- Voice input: Android system dictation (keyboard mic); web gets a mic button via Web Speech
  API where available, otherwise hidden.
- MCP preview: mutating tools accept `dryRun: true` and return the preview; Claude is the
  confirmer.

## Architecture

```
apps/app (Expo)  ─┐                       ┌─ Telegram (bot webhook, login, digests)
apps/web (Vite)  ─┼─ packages/client ──► apps/api (Worker, Hono)  ──┬─ D1: users, sessions, nonces
 (served by Worker │   (store, sync,        │  /api/auth /api/sync     ├─ KV: OAUTH_KV
  pace-web assets) │    view-models)        │  /api/parse /telegram    ├─ UserStore DO per user (SQLite):
packages/core ◄───┘                        │  /mcp /authorize /oauth  │   events, observations, projections,
 (events, materialize, presets, urgency,   │  (OAuthProvider wraps)   │   decisions, alarms
  outcomes, timeline, notify, analytics)   └──────────────────────────┴─ Groq / Gemini (AI SDK 7)
```

Event envelope (`packages/core/src/events/event-schema.ts`, zod): `{ id: ulid, type,
occurredAt, recordedAt, deviceId, precision: "exact" | "approx", source: "app" | "web" |
"bot" | "mcp" | "system", payload }`. Corrections: `event.amended { targetId, patch }`,
`event.revoked { targetId }`. Deterministic ids for system events (`hw:<presetId>:<isoWeek>`,
`auto:<taskId>:missed`, `auto:<taskId>:skipped`) make them idempotent; the reducer ignores a
second `task.created` for an existing task id.

Event types — stage 1: `task.created` (title, presetId, projectId?, importance?, dueAt? +
dueTz?, startAt? + startTz?, estimateMinutes?, subtasks[], description?, sourceText?,
fields{ticket?, submitVia?}, overrides?), `task.updated`, `task.preset.set`, `task.overrides.set`,
`task.status.set` (`not_started | in_progress | paused | waiting`), `task.subtask.solved`,
`task.subtasks.added`, `task.submitted` (subtaskIds | whole, `closes?`), `task.closed`
(`done | cancelled | cancelled_missed | skipped`, reason?), `task.reopened`,
`task.importance.set`, `task.project.set`, `task.progress.set` (0–10), `task.estimate.set`,
`task.rank.set`, `task.source.attached`, `project.created`, `project.updated`,
`preset.created`, `preset.updated`, `preset.archived`, `settings.updated`,
`focus.started`/`focus.ended` (declared now, used by the reducer for `in_progress`, emitted
from stage 3). Stage 2: `notification.snoozed`, `notification.ack`.
Stage 3: `activity.started`, `activity.stopped`, `activity.logged`, `activity.adjusted`,
`activity.labelled` (category / task link / "messengers on purpose"), `calendar.rule.set`,
`calendar.attendance.set` (attended | skipped | ended_now | still_going), `sleep.confirmed`.
Observations (not events): `usage_events`, `usage_stats`, `calendar_events`, `sleep_candidates`.

Urgency (`packages/core/src/urgency/`): multipliers ASAP 7 / Prioritized 5 / Normal 3 /
Nice-to-have 1. Policies (each `+ U_FLOOR`, capped at 3): `pace` (HW)
`(1−p)·E / max(hoursLeft, 0.5)`, after `due` with `p`, `E` over unsubmitted subtasks only;
`lag` (work with due) `r = (now−start)/(due−start)`, `u = U_FLOOR + 1.5·max(0, r−p)`; `lag`
without due → `age`; `age` `AGE_SAT·(1 − e^(−ageDays/7))`; `resubmission` per spec piecewise
(`due`, `due+softDays`, then `u_max + 0.1·daysAfter` until `finalAt`, then auto-missed).
`E = estimateHours × c_preset` (`c` injected, default 1 until stage 3 provides the median of
fact/estimate over ≥ 5 live-tracked closed tasks). Future `startAt` hides the task. Rank bonus
`0.1·(n − rank)/n` inside a category. `explain(task, now, ctx)` returns formula, inputs, steps.

## Process

- Superpowers: clone `obra/superpowers` into the scratchpad at the start of execution and
  follow `executing-plans`, `test-driven-development`, `verification-before-completion`,
  `systematic-debugging`, `requesting-code-review`; run `/code-review` at the end of each
  milestone and fix findings before moving on.
- TDD per task: failing test → implement → `bun lint` → commit. One commit per task.
- Design pass: build each screen from its artboard; at each milestone end, screenshot the web
  app with Playwright, compare to the artboards, fix spacing/contrast/empty states.
- English in code; every UI string goes through `t()` from day one (no raw strings in
  screens — enforced by review and a grep test over `apps/*/src` for JSX text nodes);
  LLM prompts accept Russian.

## Milestone 0 — Foundation

**0.1 Repo surgery.** Delete `apps/api/src/features/example-posts`, `apps/api/src/auth/*`,
`apps/api/drizzle/*`, `apps/api/tests/integration/*`, `apps/web/src/features/*`,
`e2e/*.e2e.ts`, `compose.yaml`, both Dockerfiles, `nginx.conf`, `docs/superpowers/plans/*`,
`docs/migrations.md`. Rename `@template/*` → `@pace/*`; root `name: pace`; workspaces
`["apps/*", "packages/*"]`; catalog pins (`vitest 4.1.x`, `zod`, `hono`, `drizzle-orm`,
`wrangler`); scripts `lint` (chain without Postgres `db:check`), `test:unit` (core, client,
web, api unit), `test:api`, `test:app`, `test:e2e`, `test:llm`. Update
`.dependency-cruiser.mjs` (packages are first-class; `core` imports nothing but itself and
its deps; `client` → `core` + type-only `@pace/api`; api features → `core` + `shared`;
`no-orphans` exemptions for `worker.ts`, `app.config.ts`, expo-router `app/**`),
`knip.jsonc`, `eslint.config.ts` (RN files without DOM a11y rules; default exports allowed in
`apps/app/app/**` and config files; `functional` rules for `packages/core/**` and
`packages/client/src/view-models/**`), `.jscpd.json`, `lefthook.yml`. `docs/presets.md`
documents the preset model for users of the editor, not a code file. Rewrite `CLAUDE.md`,
`docs/architecture.md`, `docs/testing.md`, `docs/linting.md`. Done when `bun install && bun
lint` passes on the skeleton.

**0.2 `packages/core` skeleton.** `package.json` (`@pace/core`, exports `./src/index.ts`,
deps `zod`, `ulidx`, `date-fns`, `@date-fns/tz`), `tsconfig.json`, `vitest.config.ts`.
`src/ids.ts` (`newId` via `monotonicFactory`, deterministic ids), `src/time.ts`
(`ZonedInstant { at, tz }`, `endOfDayIn(tz)`, `isoWeek`, `formatInZone`, `zonesDiffer`),
`src/result.ts` (moved from api),
`src/events/event-schema.ts` (envelope + discriminated union, `parseEvent`, `EventInput`),
`src/events/sort.ts`, `src/materialize/materializer.ts` (generic `materialize`, `apply`, the
re-materialize rule, amend/revoke applied to targets, revocable amendments). Tests:
round-trip, unknown type rejected, order-insensitivity (fast-check), revoke/amend semantics,
20k-event budget.

**0.3 Design tokens, i18n, brand assets.** `packages/core/src/design/tokens.ts` (dark +
light, semantic names: `bg`, `surface`, `raised`, `text`, `muted`, `accent`, `accentText`,
`warn`, `question`, project palette) with a contrast test; `packages/core/src/i18n/{en,ru,
index}.ts` (`t`, plurals, `formatDuration`, `formatRelative`, key-parity test);
`assets/logo/{pace-mark,pace-wordmark,favicon}.svg` from board 08; `scripts/generate-icons.ts`
(`@resvg/resvg-js`) → `apps/web/public/{favicon.svg,icon-192.png,icon-512.png,
apple-touch-icon.png}`, `apps/app/assets/{icon,adaptive-icon,splash}.png` (committed). Fonts:
`@fontsource-variable/geist`, `@fontsource-variable/geist-mono` (web); TTFs + license in
`apps/app/assets/fonts`.

**0.4 Worker skeleton.** `apps/api/wrangler.jsonc` (name `pace-api`, `compatibility_date`
2026-10-01, `nodejs_compat`, `routes: [{ pattern: "pace-api.nalinor.dev", custom_domain:
true }]`, vars `ENVIRONMENT`, `ALLOWED_TELEGRAM_IDS`, `TELEGRAM_BOT_USERNAME`, `WEB_ORIGIN`,
`BOT_INFO`; bindings `DB` (D1, `migrations_dir: "drizzle/d1"`), `OAUTH_KV`, `USER_STORE`
(DO, `migrations: [{ tag: "v1", new_sqlite_classes: ["UserStore"] }]`), `observability`).
`src/worker.ts` exports `{ fetch }` + DO class (1.9 wraps it in `OAuthProvider`);
`src/app.ts` Hono factory typed on `Env`, `onError` → `{ code, message }` (404/422/500),
CORS for `WEB_ORIGIN` + app origins, `GET /api/health`; `src/contract.ts` exports `AppType`.
`src/shared/config.ts` (zod over `env`). `wrangler types` → committed
`worker-configuration.d.ts`. `vitest.config.ts` with `cloudflareTest({ wrangler: {
configPath } })`, `tests/health.int.test.ts` via `SELF.fetch`.

**0.5 Databases.** D1 schema `src/shared/db/d1-schema.ts` (`users{id, telegramId unique,
name, username, photoUrl, createdAt}`, `sessions{id, userId, tokenHash, createdAt,
expiresAt, lastSeenAt, label}`, `login_nonces{nonce, createdAt, expiresAt, userId?,
consumedAt?}`), `drizzle.d1.config.ts` → `drizzle/d1/0000_init.sql`. DO schema
`src/user-store/schema.ts` (`events{seq pk, id unique, type, occurredAt, recordedAt,
deviceId, precision, source, payload}`, `observations{kind, key unique, at, payload}`,
`decisions`, `meta`), `drizzle.do.config.ts` (`driver: "durable-sqlite"`) → bundled
`drizzle/do/migrations.js` + `.d.ts` shim; `src/user-store/user-store.ts` (`class UserStore
extends DurableObject<Env>`, `drizzle(ctx.storage)`, `blockConcurrencyWhile(migrate)`).
`bun db:generate`, `bun db:check` (regenerate to temp, diff). Tests: D1 migrations applied in
`tests/setup.ts` (`readD1Migrations`/`applyD1Migrations`), DO constructor idempotent.

**0.6 Auth + login bot webhook.** `src/auth/telegram-widget.ts` `verifyTelegramLogin(data,
botToken, now)` (sorted `k=v\n`, key = SHA-256(token), HMAC-SHA-256, timing-safe compare,
`auth_date` ≤ 5 min) with a fixed test vector; `whitelist.ts`; `sessions.ts` (random
32-byte token, SHA-256 stored, 90-day sliding expiry); `auth-routes.ts`: `POST
/api/auth/telegram`, `POST /api/auth/nonce` → `{ nonce, deepLink }` (nonce ≤ 64 base64url
chars), `GET /api/auth/nonce/:nonce` → `pending | { token, user }` (consumes), `POST
/api/auth/logout`, `GET /api/me`, `POST /api/auth/dev` (`{ telegramId }`, 404 in
production); `auth-middleware.ts` (bearer → `user`). `src/bot/bot.ts` minimal grammY bot:
`/start login_<nonce>` → whitelist → bind nonce → reply "Logged in — return to Pace";
others → "Not allowed"; `POST /telegram/webhook` with secret-token check; `telegram-api.ts`
fetch wrapper (fake in tests). Tests: valid vector → 200, non-whitelisted → 403
`auth/not-allowed`, bad hash → 401, nonce pending/consumed/expired, webhook wrong secret →
401, login deep link binds the nonce, dev login 404 in production.

**0.7 Sync.** `src/sync/sync-routes.ts`: `POST /api/sync/push { events[] }` → DO validates
(core schema), clamps future `recordedAt`, skips known ids → `{ accepted, rejected[{id,
reason}], seq }`; `GET /api/sync/pull?since=&limit=` → `{ events, seq, more }`; `POST
/api/sync/observations` (append-only, idempotent by `kind+key`). DO methods `append`,
`list`, `appendObservations`. Tests: idempotent re-push, seq ordering, paging, invalid event
rejected without aborting the batch, 401 without bearer.

**0.8 `packages/client`.** `src/event-store.ts` (port), `src/adapters/memory-event-store.ts`,
`src/state.ts` (vanilla zustand store; `createState({ store, now, deviceId })`: load, materialize, `dispatch(input)`
assigns id/`recordedAt`/device, validates via core, persists, applies incrementally or
re-materializes per the rule, notifies; `revoke(eventId)`, `undoLast()`), `src/sync-client.ts`
(outbox push, pull since cursor, backoff, `online`, `syncNow()`), `src/api-client.ts`
(`hc<AppType>` with bearer; type-only import of `@pace/api`), `src/session.ts` (token port).
Tests with fake fetch: outbox survives failure, pulled retro event triggers re-materialize,
dispatch → immediate state, undo/revoke.

**0.9 Web shell.** `styles.css` from tokens (`:root[data-theme=dark]`, `[data-theme=light]`,
system fallback via `prefers-color-scheme`; Tailwind `dark` variant on `data-theme`),
`src/platform/theme.ts` (per-device preference, applied before first paint),
`src/i18n.tsx` (`useT()` bound to the account language from state), fonts, `index.html` meta
+ manifest,
`vite-plugin-pwa` 2 (`registerType: autoUpdate`, `navigateFallback`, denylist `/api`, API
origin `NetworkOnly`), env `VITE_API_URL`, `VITE_TELEGRAM_BOT`; `apps/web/wrangler.jsonc`
(name `pace-web`, `assets: { directory: "./dist", not_found_handling:
"single-page-application" }`, custom domain `pace.nalinor.dev`); `src/platform/{idb-event-store,
local-session}.ts`; `src/app-state.tsx` (wires the zustand store from `@pace/client` with
the web adapters; hooks from `@pace/client/react`); `router.tsx`: `/login` (branded card with the widget),
`/app/auth` (App Link landing with `intent://` fallback), `/oauth/authorize` (branded consent
page for MCP clients, see Decisions; built in 1.9), authenticated layout with bottom tabs
(Now, Day, Add, Projects, Insights), `RequireAuth`. `public/_headers` (CSP: `script-src 'self' https://telegram.org;
frame-src https://oauth.telegram.org; connect-src 'self' https://pace-api.nalinor.dev`),
`public/.well-known/assetlinks.json` with the debug keystore's SHA-256 (App Links work from
the first release). e2e harness: `playwright.config.ts`
starts `wrangler dev --port 8787 --var ENVIRONMENT:test` + `vite preview`;
`e2e/support/login.ts` uses `/api/auth/dev`. Tests: login page renders the widget with the
bot username; `/` redirects to `/login`; axe.

**0.10 App shell (Expo).** `apps/app` (CommonJS package: no `"type": "module"`, so
`metro.config.js`, `babel.config.js`, plugins stay CJS): `app.config.ts` (name Pace, scheme
`pace`, package `dev.nalinor.pace`, `version`/`versionCode` from the git tag with run-number
fallback, `userInterfaceStyle: automatic`, `edgeToEdgeEnabled`, permissions
`READ_CALENDAR`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `intentFilters` autoVerify for
`https://pace.nalinor.dev/app/*`; plugins: `expo-router`, `expo-splash-screen`, `expo-font`
with Android `fontDefinitions` for Geist 400–700, `expo-notifications` (icon, lime color),
`expo-share-intent`, `expo-sqlite`, `expo-calendar`, `expo-web-browser`,
`./plugins/with-release-signing.js`), `plugins/with-release-signing.js` (adds a `release`
signingConfig from `PACE_STORE_FILE/…` Gradle properties; without them it signs with
`apps/app/keystores/debug.keystore`, the standard debug key, committed), `android/`
gitignored. Metro: `getDefaultConfig` wrapped by `withNativewind` only; tsconfig extends
`expo/tsconfig.base` with `jest` types. NativeWind v5 RC + `global.css` importing the shared
token theme (both palettes; `colorScheme` from a per-device preference, default system),
`src/i18n.ts` (`useT()` from account language), `src/platform/{sqlite-event-store (WAL,
`PRAGMA user_version` migrations, exclusive transactions), secure-session, api-base}.ts`,
`modules/pace-native` scaffold (`expo-module.config.json`, manifest with
`PACKAGE_USAGE_STATS` + `ACCESS_NOTIFICATION_POLICY`, Kotlin module with
`canScheduleExactAlarms`/`openExactAlarmSettings` stubs now, usage/DND in 3.6), provider
wiring (zustand store + adapters), `app/_layout.tsx` (auth gate + tabs, safe-area insets),
`app/+native-intent.ts` (maps `https://pace.nalinor.dev/app/*` → routes; share-intent
redirect), `app/login.tsx` (bot deep link via `Linking.openURL`, poll nonce every 2 s while
focused, "Log in on the web instead" via `WebBrowser.openAuthSessionAsync(..., "pace://auth")`
→ `pace://auth?token=` in the **query**), `app/auth.tsx`. Tests (jest 29 + RNTL 14,
awaited `render`): login polls and stores the token; sqlite adapter against the
`EventStore` contract with the native layer mocked.

**0.11 CI/CD.** `ci.yml`: `lint` (bun lint + clean tree), `unit` (core, client, web, api
unit), `api` (workerd), `app` (jest), `e2e` (Playwright, report on failure), `audit`;
`android-debug` (prebuild + `assembleDebug` arm64, APK artifact) runs only on `main` and
`workflow_dispatch` — the repo is private today, so Gradle minutes are rationed. Android
job recipe: `actions/setup-java@v6` (temurin 17), `gradle/actions/setup-gradle@v6` with
`cache-read-only` off `main`, `sdkmanager --install "ndk;27.1.12297006" "cmake;3.22.1"`,
`CI=1 EXPO_NO_GIT_STATUS=1 bun expo prebuild --platform android --no-install`, `./gradlew
:app:assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a`, keystore decoded from
`ANDROID_KEYSTORE_BASE64` into `android/app/release.keystore` and passed as
`ORG_GRADLE_PROJECT_PACE_*` env (absent → the committed debug keystore; release notes say
"debug-signed").
`deploy.yml` (push `main` after CI; env `production`; `cloudflare/wrangler-action@v4`):
build web with `VITE_API_URL=https://pace-api.nalinor.dev`, `wrangler d1 migrations apply pace
--remote`, `wrangler deploy` (api), `wrangler deploy` (web), push Worker secrets from GitHub
secrets (`wrangler secret put` only when set), `setWebhook` with `TELEGRAM_WEBHOOK_SECRET`,
store `BOT_INFO` (`getMe`). `release.yml` (tag `v*`): CI gates, the Android recipe above,
`actions/upload-artifact@v7`, `softprops/action-gh-release@v3` with `pace-vX.Y.Z.apk` +
generated release notes. `llm-regression.yml` (`workflow_dispatch` + weekly). `mutation.yml`
kept (core + web). `dependabot.yml` adds `apps/app` and gradle. README lists every
secret/var.

**0.12 Cloudflare provisioning (from this session).** `wrangler d1 create pace`, `wrangler kv
namespace create OAUTH_KV`, ids into `wrangler.jsonc`; `wrangler deploy` in `apps/api` (worker
+ custom domain) and `apps/web` (`pace-web` + `pace.nalinor.dev`); set the secrets available
here (`GROQ_API_KEY`, `GEMINI_API_KEY`, generated `TELEGRAM_WEBHOOK_SECRET`).
`TELEGRAM_BOT_TOKEN` is not available here: real login stays non-functional in prod until
the user adds it (README step). Verify `https://pace-api.nalinor.dev/api/health` and
`https://pace.nalinor.dev`.

## Milestone 1 — Stage 1: tasks, presets, urgency, Now, projects, inbox, MCP minimum

**1.1 Presets.** `packages/core/src/presets/preset-schema.ts` (zod: `id`, `name`, `color?`,
`extends` (a base preset or another user preset), every field optional so a child only
stores what it changes: `urgencyPolicy` + `urgencyParams`, `defaultImportance`,
`deadlinePolicy: hard | resubmission{ softDays, finalAt }`, `submission: whole |
per_subtask`, `progressMode: subtasks | slider | none`, `recurrence?: { weekday, time }`,
`fields: { ticket?, description?, startAt?, submitVia? }`, `notify: { criticalHours,
criticalProgress, criticalScore, waitingDays, inProgressIdleDays }`,
`defaultEstimateMinutes`, `display`), `base-presets.ts` (built-in, non-editable: `hw`,
`work`, `personal`, `deferred`, `inbox`, fully specified), `preset-reducer.ts` (preset events
→ `state.presets`; archived presets stay resolvable for existing tasks), `resolve-preset.ts`
(chain base → user presets → per-task `overrides`; cycle and unknown-parent rejection),
`example-presets.ts` (seed event inputs: `hw.algebra`, `hw.calculus`, `hw.history`). Tests:
inheritance order, override precedence, invalid/cyclic preset rejected, archived preset still
resolves, seed applies idempotently (deterministic ids).

**1.2 Task reducer.** `src/model/task.ts`; `src/materialize/task-reducer.ts` for every
stage-1 event incl. `task.preset.set` (data kept, fields shown/hidden), `task.overrides.set`,
`paused`, `waitingSince` + accumulated waiting minutes, `touched` persisted after close,
`task.subtasks.added`, `task.source.attached`, deterministic-id dedupe. Derived `status`
(`in_progress` on first subtask/slider/focus), progress. Tests: artboard scenarios (HW 6 4/7
solved, 2 sent), preset switch hw→work→hw keeps subtasks and slider, waiting accumulation,
duplicate `task.created` ignored.

**1.3 Outcomes + retro validation.** `src/outcomes/outcome.ts` (`done` vs `done_late`,
subtask outcomes, task outcome derivation incl. final-deadline rule, auto-missed events with
deterministic ids via `autoOutcomeEvents(state, now)`, later retro done-before-deadline
wins). `src/validation/retro-rules.ts` (`validate(state, input) → Result`: close before
created, subtask on closed task without reopen, submit without solved subtasks, `occurredAt`
> now + 5 min). Tests per rule; outcome table per spec rows.

**1.4 Urgency + explain.** `src/urgency/{constants, policies, score, explain}.ts` per
Architecture, `c` injected (default 1). Tests: TRK-231 from the artboard (window 65%,
progress 40%, lag +0.25, Prioritized ×5, rank 2/3), ASAP end of day, Prioritized +3d,
implicit due via `pace`, post-deadline unsubmitted-only `p`/`E`, waiting frozen at
`waitingSince`, age saturation, resubmission monotonic inside pieces, property: Nice-to-have
without a due within 3 days never outranks a Normal task.

**1.5 Recurrence.** `src/recurrence/hw-instances.ts`: `expectedInstances(presets, now, tz)`
(current + next ISO week, due from schedule), `missingInstanceEvents(state, …)`, estimate
inherited from the previous instance, `autoSkipEvents` (empty instance at `due + 24h`).
Created by the client on open/foreground and by the DO before every MCP/bot apply and on
alarm (deterministic ids). Tests across DST and the year boundary.

**1.6 Queries.** `src/queries/now-list.ts` (score order, project filter, hidden future start
and empty instances, waiting section, `later`/`waiting` counts, pace marker = expected
progress), `project-view.ts` (open/awaiting/done lists; open, on-time x/y, late, hours this
week; weekly hours last 6 weeks — 0 before stage 3), `inbox.ts`, `task-view.ts` (window
elapsed %, work left, tracked, "why on top" rows from `explain`). Tests mirror artboard
numbers.

**1.7 Review rules (stage 1).** `src/review/to-sort.ts`: all solved & open > 24h →
"submitted?"; deadline passed without later events → outcome buttons; unsorted > 3 days;
auto-missed/auto-skipped awaiting confirmation (confirm / undo). Returns typed items with
suggested event inputs. Tests per rule.

**1.8 Client view-models + actions.** `packages/client/src/view-models/{now, task, project,
inbox, review, history}.ts`; `src/actions.ts`: `createTask(form)` (project by name →
`project.created` on the fly), `markSolved`, `addSubtasks`, `submit({ ids, at, precision })`,
`closeTask({ outcome, at, reason })`, `reopen`, `setStatus(paused | waiting | in_progress)`,
`setImportance`, `setRank` (within category), `setProgress`, `setEstimate`, `setPreset`,
`setOverride`, `captureInbox(text)`, `acceptSuggestion`, `revoke(eventId)`, `undoLast`,
`createPreset` / `updatePreset` / `archivePreset` (web-only callers), `seedExamplePresets`.
Quick-time presets (`now`, `1h ago`, `yesterday evening 21:00`, `at deadline`; `end of last
focus` from stage 3). Estimate hints via a `hints` port (empty until 3.3). Tests: each action
validates via core, emits expected events, undo.

**1.9 Server projections + MCP minimum.** `apps/api/src/user-store/projections.ts` (DO
applies incrementally or rebuilds per the rule; writes `tasks`, `subtasks`, `projects`;
`ensureInstances()` before reads/applies). `src/mcp/server.ts` (`createMcpHandler`,
`McpServer.registerTool`: `create_task` (with `project` by id/name), `capture_inbox`,
`get_task`, `list_now`, `list_projects`, `list_project_tasks`, `list_presets`,
`mark_subtasks`, `submit`, `close_task`, `reopen`, `update_task`, `set_importance`,
`set_rank`, `revoke_event`; every
mutating tool takes `at?`, `precision?`, `dryRun?`; user id from `getMcpAuthContext().props`).
Also `search` (full-text over tasks, projects, decisions → `{ id, title, url }` list) and
`fetch` (id → full document) for ChatGPT-style connectors; every tool has a scope
requirement checked against the grant and MCP annotations. `src/mcp/oauth.ts`
(`new OAuthProvider({ apiRoute: "/mcp", apiHandler, defaultHandler: app, authorizeEndpoint:
"/authorize", tokenEndpoint: "/oauth/token", clientRegistrationEndpoint: "/oauth/register",
clientIdMetadataDocumentEnabled: true, scopesSupported, accessTokenTTL: 86400 })`); Hono
`GET /authorize` → validates with `parseAuthRequest`, redirects to the web consent page
(`/oauth/authorize?<query>`: client name/logo, requested scopes with plain-language
descriptions, Telegram widget, Allow / Deny); `POST /oauth/complete` (HMAC + whitelist +
chosen scopes → `completeAuthorization({ props: { userId }, scope })` → `{ redirectTo }`),
`POST /oauth/deny`; `GET /api/oauth/grants` + `DELETE /api/oauth/grants/:id`
(`listUserGrants`/`revokeGrant`) for the "Connected apps" settings page; dev login path in
non-prod. `docs/mcp.md`: setup for Claude (web/desktop/Code), ChatGPT connectors, Cursor,
MCP Inspector. Tests: discovery documents, DCR, full PKCE dance in workerd, refresh
rotation, revocation kills the token, scope enforcement (write tool with read-only grant →
error), non-whitelisted → 403, `tools/list`, `search`/`fetch`, `create_task` → event visible
via `/api/sync/pull`, `dryRun` writes nothing; manual check with MCP Inspector before
release.

**1.10 Web: Now.** `features/now/` (artboard 1): header date + inbox counter, focus bar (stage
3; before that a quiet "Nothing running" row), project chips, task rows (check circle, color
dot, title, meta line, progress bar with lime pace marker), drag-reorder within a category
(`@dnd-kit`), "+ N later · M waiting". RTL tests for meta rendering (due tomorrow, 1 day
late, ASAP) and optimistic check; e2e: create → appears → check → gone + undo; reorder.

**1.11 Web: task, close, project, inbox, add (manual), settings, history.** `features/task/`
(artboards 2–3: header with project link, tags, stats card, problems with solved/sent
states, work variant with description + slider, "Why it's Nth" card from `explain`, actions
Focus / Pause / Waiting / Done / Submit, override sheet for due/importance/estimate/policy,
preset switch, source text + re-parse placeholder), `close-sheet.tsx` (artboard 4: when
pills, exact toggle, outcome preview, Submit, "Close task as… Cancelled · Skipped" with
reason + recent reasons), `features/project/` (artboard 7 incl. "awaiting assignment"),
`features/inbox/` (artboard 6; rule-based suggestions until 2.3; Accept / Accept all /
Delete; quick capture), `features/add/` (form: preset, project by name, due picker that always shows the zone in
use, estimate buckets with hints port + empty state, subtasks; paste → parse lands in 2.3),
`shared/time/zone-banner.tsx` (device zone ≠ account zone → banner with one-tap switch) and
`zoned-time.tsx` (shows the original zone and the viewer's time when they differ),
`features/settings/` (theme per device: system / light / dark; language per account: EN /
RU; timezone (account) with the device zone shown beside it; windows; "Connected apps" with
revoke; logout), `features/oauth/` (consent
page per 1.9), `features/presets/` (web-only editor:
list with base/user badges, create "from base" or "from preset", form sections mirroring the
schema with inherited values shown as placeholders and an "override" toggle per field,
recurrence picker, resubmission/final deadline, notify thresholds, live preview card of a
sample task, archive; first-login onboarding card "Start from example course presets"),
`features/history/` (board-at-date slider, event list with revoke). Component tests for
close-sheet time logic, estimate buckets, and the preset form (inherited placeholder vs
override, validation errors);
e2e journeys: seed presets → create a course preset → HW instance appears for this week;
HW flow (solve 3,4 → submit "1h ago" → on time), work slider → in progress, inbox triage,
project stats, revoke from history; axe on every page.

**1.12 App: stage-1 screens.** `apps/app/app/(tabs)/{now,day,add,projects,insights}.tsx`,
`app/task/[id].tsx`, `app/inbox.tsx`, `app/project/[id].tsx`, `app/settings.tsx`,
`app/history.tsx`; components in `src/components/` mirroring web (NativeWind from the same
tokens, both themes); settings: theme (device) + language (account); bottom sheet for close; drag-reorder (`react-native-reanimated` +
`gesture-handler`); share intent → add screen prefilled; presets are read-only (picker shows
synced user presets; settings links to the web editor). RNTL tests: Now ordering/meta,
problems toggle, close sheet presets.

**1.13 Release stage 1.** Deploy; manual check on `pace.nalinor.dev` and the APK from
`release.yml` (`v0.1.0`); `/code-review`; README "Stage 1".

## Milestone 2 — Stage 2: LLM input, Telegram bot, notifications, decision log

**2.1 Parse schema, verification, apply.** `packages/core/src/parse/schema.ts` (zod, flat:
`intent` ∈ `create_task | add_to_task | mark_subtasks | close_task | log_activity |
start_activity | classify_activity | unknown`; `create_task` carries `suggestedPreset`,
`suggestedImportance`, `project`; `questions[{ field, question, options }]`; `evidence[{
field, quote }]`), `normalize.ts` (per Decisions), `verify.ts` (every number/date/label field
needs a literal evidence quote, else `doubtful`), `apply.ts` (verified result + answers →
event inputs; HW instance by preset + week; task refs by id/title; `task.source.attached`
for `add_to_task`; project on the fly; activity intents return `unsupported_until_stage_3`
in M2), `regression/cases/*.json` seeded with the spec examples, `regression/run.ts`,
`scripts/llm-promote.ts` (decision id → new case). Tests: invented numbers flagged; `5а` →
question; normalization table.

**2.2 API parse feature.** `apps/api/src/parse/llm.ts` (AI SDK 7 `generateText({ output:
Output.object({ schema }), providerOptions: { groq: { structuredOutputs: true,
reasoningFormat: "hidden" } } })`, providers `groq` / `gemini` / `fake`, prompt budget ≤ 3k
tokens asserted in a test), `budget.ts` (per the LLM budget decision: reads `x-ratelimit-*`,
keeps `llm_budget` in the DO, `canRun(priority)`, `retryAt`), `queue.ts` (`llm_queue` in the
DO drained by alarm; results become review items / bot messages), `GET /api/llm/status`,
`prompt.ts` (presets, open tasks as compact lines, projects, `now`, account tz; rules:
"never guess what presets define", "copy every extracted string verbatim from the source,
never translate or normalise it"),
`parse-routes.ts` `POST /api/parse { text, channel }` → `{ result, verified, decisionId }`
(user presets come from the DO state, so a course added in the UI is parseable at once;
`questions` are asked in the account language);
`POST /api/parse/:decisionId/accepted { finalResult }` records the corrected result
(`decision.kind = parse_accepted`). Tests (`fake` provider with scripted 429s): interactive
call waits when reset ≤ 20 s, switches provider otherwise, returns `llm_unavailable` with
`retryAt` when both are out; passive call below reserve is queued and drained by
`runDurableObjectAlarm`; Russian input yields Russian title/labels untouched. `bun test:llm`
runs the regression set on real providers and writes `docs/llm.md`.

**2.3 Add from text (web + app).** Artboard 5: textarea (+ web mic button), "Parsed in Xs ·
nothing saved yet", fields card (Goes to, Due ✓ matches preset, problems chips ✓/?,
details), question card with option pills, legend, actions "To Inbox" / "Add to HW 7";
source text stored; re-parse on the task page; inbox suggestions from parse. LLM-unavailable
state: "LLM limit reached, back ~14:05 · Save to inbox and parse later / Fill in manually"
(the manual form keeps the text as description); a small status dot on the Add tab reflects
`/api/llm/status`. App: same; share intent lands here. Tests: RTL for chips/questions and
the unavailable state; e2e with `fake` (incl. a scripted outage).

**2.4 Telegram bot (full).** Extend `src/bot/` (all messages via core `t()` in the account
language): `/now` top 5; any text or forward → parse → preview message with inline keyboard
(Accept / To inbox / Cancel; question options as buttons); when the LLM is unavailable:
"Saved to inbox, I'll parse it ~14:05" and the queued result arrives as a new preview;
accepted result recorded; project on the fly; non-whitelisted → "Not allowed". Tests: text →
preview → accept → events in DO; question answered via button; outage path queues and later
delivers.

**2.5 Notifications.** `packages/core/src/notify/{constants, rules, digest, schedule}.ts`
(windows, quiet hours, critical rules incl. `criticalScore`, threshold-step logic with the
retro-suppression rule, stuck rules `waitingDays` / `inProgressIdleDays`, snooze,
`nextAlarmAt(state, now)`, `plan(state, now)` for the app), `apps/api/src/notify/scheduler.ts`
in the DO (alarm → digest/critical → bot → decision; re-arm), callbacks: snooze (next window
/ tomorrow morning / pick time), outcome buttons, stuck buttons (nudge / split → task link /
postpone → `startAt` / cancel → close), confirm/undo for auto outcomes. `GET /api/notify/plan`.
Tests: `runDurableObjectAlarm` sends a digest with the review block; suppressed outside
window and retro crossings logged; one critical per task; snooze defers; stuck buttons emit
events.

**2.6 Decision log + "why?".** DO `decisions` (`id, at, kind, taskId?, rule, inputs,
outcome, explanation`), written for parse, notifications (sent/suppressed), auto outcomes,
auto skips, digest top lists (with scores + inputs). `GET /api/decisions?taskId=&from=&to=&q=`,
MCP `search_decisions`, web/app `features/decisions/` with search; minimal "why?" sheet on
score and notifications. Tests: filters; explain renders inputs.

**2.7 App local notifications.** `apps/app/src/platform/notifications.ts`: schedule from
`/api/notify/plan` (window reminders, stuck mirrors) with snooze actions mirroring the bot;
permission flow; channels (normal + silent). jest tests on the pure scheduling function in
`client`.

**2.8 Release stage 2.** Deploy (`setWebhook` by CI), `getWebhookInfo` check, tag `v0.2.0`,
`/code-review`, README "Stage 2" (bot setup, `/setdomain`).

## Milestone 3 — Stage 3: time ledger, focus, calendars, sleep, usage, analytics, MCP analytics

**3.1 Timeline model.** `packages/core/src/time/timeline.ts` (activities, primary/background,
start closes previous primary, retro insert trims/splits, gaps > 15 min, day totals by
primary, idle), `expect-limit.ts` (defaults chain manual → median by label/category/series →
category default → global; returns `{ value, source, samples }`), `model/activity.ts`.
Tests: property "primaries never overlap", insertion cases, gaps, defaults chain with
samples.

**3.2 Focus, sleep, usage, calendar rules.** `src/time/focus.ts` (session = task activity,
rating; `in_progress`), `sleep.ts` (`detectSleep(usageEvents, { minHours: 3, mergeGapMin:
10 })` → candidate with fragmentation; confirm trims an overlapping open activity, logged),
`usage.ts` (per-activity app list; penalty per Decisions; `trimToLastUnlock`), `calendar.ts`
(observed events → activities by default; series rules; `attended | skipped | ended_now |
still_going`; missed → gap), decision records for every automatic change. Tests with
synthetic unlock/screen events and the artboard Day.

**3.3 Analytics + calibration.** `src/analytics/{time-by, on-time, debt, outcome-vs-time
(incl. start moment vs due), plan-vs-fact, productive-hours, focus (ratings, engagement,
vs previous night's sleep), fragmentation, tracking-delay}.ts`, all with `projectId?`
filter; `src/estimates/calibration.ts` (`c_preset`, samples, bucket hints) wired into 1.4
and the 1.8 hints port. Tests on fixtures.

**3.4 Client stage-3 view-models/actions.** `view-models/{day, insights, schedule,
activity}.ts`; actions `startActivity(label | category | task, { expect | limit })`,
`switchActivity`, `stop`, `logPast`, `adjustBoundary`, `addBackground`, `startFocus` /
`endFocus(rating)`, `confirmSleep`, `setAttendance` (incl. ended now / still going),
`setCalendarRule`, `labelActivity` (accept / fix / skip LLM suggestion), `trimToLastUnlock`,
`recordObservations`; activity intents from 2.1 now apply; quick-time "end of last focus";
review items: gaps, long-running (with trim), unparsed labels, sleep confirm, calendar
attendance. Tests.

**3.5 Web stage 3.** `features/day/` (artboard 8: header totals, day bar, timeline rows with
draggable boundaries via pointer events, gap card Attended / Skipped / Something else,
running row, quick-start input with label suggestions + mic), Now focus bar (pause / switch
sheet), activity sheet (apps used, counted time, label suggestion accept/fix/skip),
`features/focus/` (rating), `features/insights/` (charts per the `dataviz` skill: scales,
binning and layout math in `packages/core/src/charts/`, rendered with inline SVG on web and
`react-native-svg` in the app; project filter chip), `features/schedule/` (day/week calendar
from phone observations),
`features/export/` (Excel via SheetJS: tasks, subtasks, activities, decisions), "why?" for
defaults with sample lists. Tests: drag math, gap actions; e2e: start/switch/log past/adjust;
axe.

**3.6 App stage 3.** Day screen with gesture drag, focus with DND (`modules/pace-native`:
`setDnd` → `INTERRUPTION_FILTER_PRIORITY`, `isDndAccessGranted`, `openDndAccessSettings`),
calendar sync on foreground (`expo-calendar`: `getEventsAsync` ±7 days, filter
`isSynced && isVisible`, all-day normalised by `timeZone` → observations), usage batch
(`modules/pace-native`: `queryUsageEvents` filtered to screen/keyguard/activity events,
`queryUsageStats`; windows of ≤ 12 h with a persisted watermark; on foreground + a 30-min
`expo-background-task`), sleep confirm card, Expect/Limit local notifications (channels:
`timers` HIGH + `bypassDnd`, `quiet` LOW; Expect silent at 1.5×/2× with "Trim to last unlock"
action; Limit −10 min and at exceed, also via bot; quiet hours → Limit only; exact alarms
via `canScheduleExactAlarms`/`openExactAlarmSettings` with an explanation screen), schedule
viewer, permission screens (usage access, DND access, exact alarms, battery optimisation).
jest tests for JS planning; Kotlin compiled by the CI Android job.

**3.7 Server analytics + MCP.** DO projections `activities`, `focus_sessions`, `sleep`
(+ observation tables); notification suppression during attended calendar events (logged);
MCP `describe_schema` (incl. raw `events`), `query_sql` (SELECT/WITH only, no `;`/PRAGMA/
ATTACH, wrapped `LIMIT 500`, run inside a rolled-back transaction), summaries
(`summary_weekly`, `summary_time_by_category`, `summary_lateness_by_course`,
`summary_estimate_accuracy`), `simulate({ constants, from, to })` (replays core urgency +
notification rules over the log), `log_activity`, `export_all` (NDJSON); `GET /api/export`.
Tests: write attempts via `query_sql` leave no trace; summaries equal core analytics on the
same events; simulate reproduces logged decisions with default constants.

**3.8 Release 1.0.** Deploy, tag `v1.0.0`, `/code-review`, README complete (screenshots,
architecture, setup, secrets table, BotFather steps, Cloudflare steps, Android signing,
limitations: Exchange calendar needs device verification, usage access permission).

## Open-source readiness (alongside milestones)

`README.md` (what/why, screenshots, architecture, quick start, deploy, release, MCP setup for
Claude and ChatGPT), `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE` (MIT, holder updated),
`.env.example` without secrets, `wrangler.jsonc` with resource ids and non-secret vars only,
`docs/{architecture,testing,linting,llm,presets,mcp}.md`. No model ids in commits.
Dependabot on.
The repository is private today; flipping it public is the user's call (CI minutes become
free then, and the Android job can run on PRs).

## Verification

- Every task: `bun lint` clean, new tests red → green, `bun test:unit`, `bun test:api`,
  `bun test:app`.
- Milestone ends: `bun test:e2e` (axe on every page in both themes), Playwright screenshots
  vs artboards (dark) plus a light-theme pass, RU catalog spot-check, `/code-review` findings
  fixed.
- Deploy: CI green on `main` → `deploy.yml` → `curl https://pace-api.nalinor.dev/api/health`,
  open `https://pace.nalinor.dev`, widget login (needs the user's bot token), bot
  `getWebhookInfo`, MCP connector added in Claude and in ChatGPT (developer-mode connector)
  and `list_now` / `search` work; MCP Inspector OAuth flow passes.
- Release: push tag → APK on the GitHub Release → install → bot login round trip → tasks sync
  between app and web.
- Stage 2: `bun test:llm` ≥ 95% on the regression set with the default model.
- Stage 3: on device: calendar list shows the Exchange calendar (manual), usage access →
  sleep candidate next morning.

## What the user must do (cannot be done from here)

1. GitHub repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts, KV, D1, Workers
   Routes/Custom Domains, Zone DNS for `nalinor.dev`), `TELEGRAM_BOT_TOKEN`, `GROQ_API_KEY`,
   `GEMINI_API_KEY`. Variables: `CLOUDFLARE_ACCOUNT_ID` (`1522185d2c630978a1e1c244b012dba2`),
   `TELEGRAM_BOT_USERNAME` (`PaceTaskTrackerBot`). Android signing secrets are **not** needed
   now (debug keystore); when a real keystore is wanted later, add `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, update
   `assetlinks.json` (README) and reinstall the app once.
2. BotFather `/setdomain` → `pace.nalinor.dev`: already done by the user.
