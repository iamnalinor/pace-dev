# Pace — план технических улучшений

> Recovery note (2026-11-05): the original record below is historical. Current authority,
> main-based integration status and remaining work are in
> [continuation-2026-11-05.md](technical-execution/continuation-2026-11-05.md).
> Push/checkpoint/PR work is authorized; exploratory QA and emulator execution are excluded.

Срез исходников: 3 ноября 2026. Исполнение начато в этой сессии по разрешению владельца; статус реализации ведётся в `context/technical-execution/ledger.md`.

## Правила исполнения (обновлено в этой сессии)

- Использовать `CLAUDE.md`, реальные исходники Superpowers (план, TDD, debugging, review), ECC (профильное ревью) и pm-skills (проверка рисков и критериев). Версии источников зафиксированы в `technical-execution/plugins-lock.json`.
- Общий roadmap разбивается на проверяемые задачи в `technical-execution/implementation-plan.md`. Реализация и независимое ревью идут последовательно; результаты и принятые решения сохраняются в ledger.
- Владелец разрешил продолжить реализацию и уточнил: **полный exploratory QA не запускать**. Для пользовательских фич — отдельный Sol-агент на точечную реальную E2E-проверку. Автотесты и `bun lint` остаются обязательными по области изменений.
- Работа локальная от PR #54, без push/deploy/publish. Передача: bundle с коммитами, `git format-patch`, diff и инструкция применения к исходной базе. Незавершённые/непроверенные этапы не выдавать за готовые.
- Установка окружения и чтение плагинов уже разрешены. Не устанавливать сторонние hooks автоматически: использовать нужные инструкции из исходников.

## Основание и рабочая база

- Репозиторий: https://github.com/iamnalinor/pace-dev, клонирован обычным Git.
- Последний merged PR: #53, Design overhaul A, `main` = `e03360ff25eb1fe8205d92da798c578a8511efb7`.
- Открытый draft [PR #54](https://github.com/iamnalinor/pace-dev/pull/54): Design overhaul B, ветка `claude/pace-design-overhaul-b`, HEAD = `a67cc504dac7f4569a8cbc5da91c8ed4350bc5a3`.
- Для этого плана создана локальная ветка `codex/technical-roadmap` от указанного HEAD #54. Ничего не отправлено на GitHub.
- Источники идей — брифы в `context/`, датированные 1–2 ноября. Они появились после работ над #48, до слияния #53. Это не новые предположения из ревью.

## Что именно было предложено

| Идея | Исходный документ | Что подтверждено текущим кодом / контекстом |
|---|---|---|
| Android E2E на эмуляторе | [android-e2e-plan.md](android-e2e-plan.md) | Нужны проверки нативных сценариев поверх существующих web E2E; отдельного Android E2E workflow в текущем дереве нет |
| Firebase-конфиг с выбранного сервера | [firebase-from-server-plan.md](firebase-from-server-plan.md) | `app.config.ts` всё ещё читает `GOOGLE_SERVICES_FILE` и пишет `extra.firebaseProject`; в `InstanceSchema` поля `firebase` нет |
| OTA для JS и assets Android | [ota-updates-plan.md](ota-updates-plan.md) | `apps/app/app.config.ts`: `updates: { enabled: false }` |
| Checkpoint + tail, старые данные в R2 | [cold-storage-plan.md](cold-storage-plan.md) | `user-store/state.ts::rebuild` материализует весь переданный лог и собирает множество всех ID; это нельзя заменить просто удалением старых строк |
| Инфраструктура через порты и адаптеры | [infra-portability-plan.md](infra-portability-plan.md) | `shared/db/d1.ts` экспортирует `DrizzleD1Database`; push-модули принимают `D1Database`, user store связан с DO |
| Telegram OIDC | [telegram-oidc-plan.md](telegram-oidc-plan.md), раздел Status | **Не реализовывать:** более позднее решение внутри документа отменяет первоначальное «to do». Для используемых сторонних Telegram-клиентов оставить bot deep link |

Приоритеты и разбиение на PR ниже — предложение этого плана. Ограничения внутри исходных брифов уже приняты владельцем.

## Как совместить с редизайном

Основание: [design/HANDOFF.md](design/HANDOFF.md). A уже merged. В B приняты задачи 3.1–3.5; остаются 3.6–3.10, экраны 4.1–4.13 и 7.1–7.3. C ещё не начат: motion, latency, web/PWA, финальные проверки.

1. Планировать по #54 правильно: он содержит новое UI-ядро. Саму техническую программу не добавлять в незавершённый PR редизайна.
2. Пока B/C меняются, можно делать измерения, серверный Firebase-контракт и каркас Android CI. Изменения экранов Settings/About/Change server интегрировать после стабилизации соответствующих экранов B, предпочтительно после C.
3. Перед каждым implementation PR обновлять исходники и проверять актуальные HEAD и CI. Этот срез не подтверждает зелёный CI последнего коммита #54.
4. По умолчанию реализация отдельными PR от `main` после слияния редизайна. Если начинать UI раньше — отдельная stacked-ветка от актуального B/C с явной базой. После squash-merge перенести только свои коммиты на новый `main`, не старую историю B целиком.
5. Не смешивать рефакторинг DO и миграцию cold storage в одном PR: иначе сложно отличить изменение поведения от изменения инфраструктуры.

| Участок | Пересечение | Решение |
|---|---|---|
| `apps/app/app.config.ts` | B уже меняет конфиг; Firebase и OTA меняют native build | Firebase раньше OTA; перед обновлением runtime дождаться финальных native-изменений |
| Settings / notification settings | B меняет экран; Firebase меняет причины polling; OTA добавляет статус | Использовать финальный kit, все строки EN/RU через `t()` |
| Change server | Firebase добавляет настоящий restart процесса | Сохранить новый UI и существующие проверки доступности сервера |
| `.github/workflows/release.yml` | Android E2E, удаление baked Firebase, OTA | Вносить последовательно; сохранять обычный APK-путь |
| User store / sync / schema | Ports и cold storage затрагивают одни границы | Сначала узкие интерфейсы и тесты, потом checkpoint и только затем архив |

## Рекомендуемая последовательность

`Измерения + Android CI → Firebase → OTA`; отдельно `измерения → минимальные порты → checkpoint → архив + новый sync`. Полный альтернативный сервер — последним и только если нужен.

### T0. Зафиксировать базу и измерить нагрузку

**Результат:** короткий baseline с датой, SHA и воспроизводимой методикой.

- Повторить проверку открытых PR, перечитать handoff и исходные брифы. Не считать старое слово «to do» доказательством незакрытого бага.
- Снять фактические DO/D1 rows read/write, объём данных и число активных пользователей за доступный репрезентативный период. Доступ к production-метрикам в этой работе не получен; цифры и срок исчерпания квот не выдуманы.
- На синтетических аккаунтах за 1, 6 и 12 месяцев измерить холодный rebuild, число прочитанных строк, размер sync и полного экспорта. Отдельно измерить память: `ids` и состояние тоже могут расти.
- Проверить стоимость и время Android CI. В брифе осталась ссылка на private repo, но GitHub сейчас показывает public. Режим dispatch + перед релизом сохраняем как исходное решение; необходимость ограничивать запуск именно квотой пересмотреть по фактическому аккаунту.

**Выход:** если запас по хранилищу большой, сначала checkpoint и агрегаты без удаления исходных данных; полный R2-архив можно отложить. Если рост критичен — cold storage получает приоритет перед OTA. Только агрегаты, без надёжного архива, не основание удалять raw usage.

### T1. Android E2E — сначала страховка для нативных изменений

**PR T1a:** новый workflow с ручным запуском, x86_64 test APK, KVM-эмулятор API 34+, локальный Worker через `10.0.2.2`, Maestro, artifacts с logcat и снимками при сбое. Release APK остаётся arm64. Версии инструментов зафиксировать после проверки совместимости.

**PR T1b:** сценарии и подключение успешного прогона как обязательного шага перед публикацией APK:

- dev login → Now; несовместимый `/api/instance` → versions screen;
- Change server: рабочий → недоступный → исходный;
- Devices/sessions: текущая сессия, добавление компьютера, отзыв второй сессии;
- переключение Google/background check; показ battery step и открытие системного диалога;
- принудительный WorkManager job → notification → открытие нужной задачи;
- usage access → upload → проверка `phone_uses` / `knownUntil`.

**Файлы:** `.github/workflows/ci.yml`, `release.yml`, новый Android workflow и каталог Maestro; `apps/app/modules/pace-native`; `docs/testing.md`.

**Критерий:** каждый flow ловит намеренно сломанное поведение, а затем проходит на исправной сборке. Test login/inspection endpoints доступны только тестовому окружению. FCM проверять отдельно от детерминированной polling-ветки: нужны Google Play services, тестовый проект и реальные credentials. Эмулятор не заменяет проверку vendor battery savers, haptics и ночного Doze на телефоне.

### T2. Один APK для Firebase разных серверов

**PR T2a — сервер, additive rollout.** Сначала parser/validator, tolerant контракт и additive output без глобального отказа API. Текущий `deploy.yml` публикует Worker до записи Firebase secret: строгую проверку включать только после исправления порядка deploy и проверки существующих Worker-only bindings. Отсутствие GitHub secret не означает, что secret отсутствует у действующего Worker.

- Чистый parser `FIREBASE_ANDROID_CONFIG` в core: все Android clients из файла, выбор не ограничен пакетом Pace.
- В `packages/core/src/api/schemas/instance.ts` добавить tolerant `firebase: {projectId, senderId, apps[]} | null`; связанный контракт в `endpoints.ts`, затем handler и client.
- Проверять пару `FIREBASE_ANDROID_CONFIG` + `FIREBASE_SERVICE_ACCOUNT`: обе отсутствуют — push выключен; одна отсутствует, JSON сломан или проекты расходятся — `server/misconfigured` с кодом причины, без значений секретов.
- Проверка до deploy и на API/health; конфигурация читается из request env. Кэш проверки не должен смешивать разные env в тестах.
- Обновить `deploy.yml` и self-hosting docs. **До включения глобальной runtime-проверки настроить обе переменные на действующем сервере**, иначе план сам создаст outage.

**PR T2b — native + клиент.**

- Kotlin: хранение конфигурации, инициализация Firebase до запроса token, `ensureFirebase`, настоящий restart процесса. Отдельно подтвердить порядок старта `expo-notifications`.
- Связать server origin и Firebase config как согласованную сохранённую пару; восстановление после сбоя записи не должно соединить новый сервер со старой конфигурацией.
- В `features/server/change-server-sheet.tsx` и `platform/server-store.ts`: после подтверждения другого сервера сохранить конфиг и один раз перезапустить Android. Web сохраняет текущий путь.
- Выбирать entry по реальному native package name. Если entry нет, polling и понятная информационная причина в Settings; чужой entry не использовать.
- При ротации проекта на том же сервере — сохранить новое значение, polling до следующего cold start. **Предлагаемый выбор:** не перезапускать приложение самопроизвольно в foreground/background.
- В `platform/notifications.ts` посылать projectId реально инициализированного Firebase; убрать baked helper только после серверного rollout. Удалить `googleServicesFile`/`extra.firebaseProject` и запись файла из `release.yml`.
- Сделать package/domain/scheme собственных сборок настраиваемыми; разобрать связанные intent filters и redirects.

**Критерий:** старый APK продолжает получать push; новый APK обновляется без повторного входа; свежая установка работает; переключение между двумя проектами и обратно доставляет push; no-config и no-package честно показывают polling. Проверки parser/API/Jest плюс Android flows и реальный телефон. Секрет service account никогда не попадает в `/api/instance`.

### T3. OTA после Firebase и стабилизации native-слоя

**PR T3a — проверка решения и runtime guard.** По исходному брифу первый кандидат — отдельный publisher Worker + R2 с Expo Updates protocol. В коротком прототипе проверить подписанный manifest, assets, выбор runtime/channel и rollback на release-like APK. Если сложность реализации велика — документировать сравнение с EAS; не считать выбор EAS уже согласованным.

**PR T3b — полный путь публикации.**

- `expo-updates`, runtime fingerprint с проверкой на реальных Kotlin/module/permission-изменениях; совместимый JS-only diff не меняет runtime. Отдельный key для OTA, certificate в APK.
- Источник обновлений определяется издателем APK/build variable, **не выбранным API-сервером**.
- `preview` → проверка → отдельный dispatch promotion в `production`; publish запрещён при несовпадении runtime с целевым APK. До публикации assets полностью загружены, manifest публикуется последним.
- Проверка на запуске/foreground не чаще раза в час; применение на следующем cold start. В Settings/About — APK, runtime, OTA id/date, «готово к перезапуску», причина rollback.
- Отказ сети не ломает запуск. Проверить ограничение загрузки по мобильной сети на выбранной версии API; не обещать его без проверки.

**Критерий:** unsigned/wrong signature/unknown runtime не применяются; аварийный bundle откатывается без циклов; embedded bundle запускается offline; старый сервер даёт versions screen. Проверки подписи и rollback выполняются настоящим `expo-updates` на APK, не только mock-тестом. Нативные изменения по-прежнему выпускаются APK.

### T4. Минимальные порты инфраструктуры

**PR T4a:** зафиксировать контракты `UserStoreHost`, `Scheduler`, `LiveChannel`, `SqlDatabase`, `ActorStorage`, `KeyValue`, `RequestPlace`, `Assets` в `apps/api/src/shared/ports/`. Разделить применение: сначала внешние зависимости, затем actor orchestration. Существующий typed RPC-контракт переиспользовать.

**PR T4b:** Cloudflare adapters в `apps/api/src/platform/cloudflare/`, wiring в Worker entry. Domain не знает DO/D1/KV. Первый SQL-контракт ограничить SQLite; перенос на Postgres не входит в этот этап. Не создавать фиктивный универсальный SQL API поверх несовместимых драйверов.

**Проверки:** один writer на пользователя; параллелизм разных пользователей; сохранённый alarm после рестарта, past wake-up ровно один раз, rearm только раньше; 4401 закрывает sockets только нужной сессии; migration runner не применяет миграцию дважды.

**Guard:** dependency-cruiser ловит запрещённые импорты. Но `request.cf` и ambient `D1Database` могут не образовать import edge: для них нужен ESLint/AST guard, а не обещание решить всё dependency-cruiser. Намеренная утечка должна ломать lint. Это уточнение к исходному брифу.

**Критерий:** прежние API/e2e тесты проходят на Cloudflare без изменения контрактов пользователя; SQL и поведение alarms/socket hibernation сохранены. Production остаётся на Cloudflare.

### T5. Checkpoint, архив и sync — отдельно от механического рефакторинга

**PR T5a — checkpoint без удаления данных.**

- `user-store/state.ts`, `state-cache.ts`, `cloud-store.ts`, `schema.ts`, core materializer: версионированный checkpoint, cutoff, event cursor и metadata для восстановления. Checkpoint state недостаточен без правил corrections и дедупликации.
- Cutoff по полному дню в зоне пользователя, ориентир 30–45 дней; открытые task/series/pool/night зависимости должны сохраняться. Описать случай, когда зависимость удерживает cutoff месяцами: обещание строго постоянной стоимости тогда неверно.
- Не путать `occurredAt` с порядком доставки: поздний backdated event может прийти с новым cursor. Amend/revoke старого ID и цепочки corrections должны давать тот же результат, что полный replay.
- Shadow-сравнение нового пути со старым. Raw usage агрегировать, но исходники до безопасного архива сохранять.

**PR T5b — архив.** На этом этапе только запись/верификация, pruning выключен. Его активация — отдельный шаг после T5c и проверки restore.

- Добавить узкий `ArchiveStore` port и R2 adapter, не прямые R2-вызовы из domain.
- Immutable versioned compressed JSONL по пользователю/месяцу; manifest с count/hash/schema. Состояния операции: prepared → uploaded → verified → committed → pruning. После crash каждый шаг безопасно повторяется.
- Удаление hot rows только после read-back, сверки checksum/count и фиксации archive manifest. Ошибка R2 оставляет данные в DO.
- Исправление архивной истории — новая версия + пересборка checkpoint при необходимости. Export собирает hot + cold без пропусков и дублей. Account deletion очищает и архив: это дополнительный критерий полноты, не новая продуктовая фича.

**PR T5c — sync и чтение истории.**

- Новый контракт checkpoint + tail для нового устройства и устаревшего cursor; protocol bump и совместимый rollout. Обновить `packages/client`, local stores, API, analytics/MCP.
- Сначала сервер и клиент умеют новую форму без pruning; несовместимые клиенты получают versions screen; только затем включается pruning. Политика API-протокола отдельно от native runtime OTA.
- Не потерять локальный unsynced outbox при установке checkpoint. После bootstrap сеть успокаивается, repeated pulls отсутствуют.
- Старые периоды доступны через агрегаты/архив с явным состоянием загрузки. Полный export и аналитика сверяются со старым путём.

**Критерий:** property tests full replay = checkpoint + tail на разрешённых cutoffs; backdated/amend/revoke, restart в каждой фазе архива, недоступный R2, новое устройство, долго offline устройство с несинхронизированными событиями. На годовой истории замерить reads/time/memory; отчёт содержит фактические значения и исключения. После pruning откат старого binary сам по себе недостаточен: нужен проверенный restore hot log из архива и восстановление совместимого schema/protocol.

### T6. Альтернативный хост — после подтверждения необходимости

Сначала проверить workerd в Docker с persistent volume: перезапуск alarms, sockets, backup/restore, границы production-пригодности. Если достаточно — описать этот путь, полноценный Node/Bun host отложить.

Если нужен отдельный runtime — single-process Bun/Node, SQLite per user, mutex per user, durable scheduler и WebSocket adapter. Общие contract tests и сценарии API запускать на обоих хостах; `cloudflare:test`-специфичные проверки остаются adapter tests. Не считать переписанный тестовый double доказательством работоспособности второго runtime. Multi-node и перенос текущего production вне scope.

## Что делать со старым хвостом #48

Не переносить [pr48-followups.md](pr48-followups.md) целиком в новый backlog: файл исторический.

- A1–A8 разобраны в #53: first pull, time bar, network hygiene, LLM, sign-out, presets, self-hosting, tooling; затем A9 MCP/session. Источники: `design/pr-a-followups-report.md`, последующие fix reports и `design/HANDOFF.md`.
- UI-хвост уже распределён по B/C: Enter в sheet, `/add` focus, offline pill/toast, controls, Day/Week, Settings, latency. Владение остаётся у редизайна.
- Старые carried-over пункты (sleep awake signals, query_sql, delivery retries, undoLast, series start, version label) требуют повторной сверки после C; исходный список сам по себе не доказывает, что они всё ещё открыты. Они не включены как подтверждённые баги в пять технических инициатив.
- Замены LLM keys, проверка слотов и signing keystore — действия владельца/оператора, а не автоматически выполненная часть плана.

## Общий Definition of Done

Для каждого implementation PR: contract-first; TDD на меняемое поведение; `bun lint`; подходящие `bun test:unit`, `bun test:api`, `bun test:app`, `bun test:e2e`; Android flows для native изменений. Миграции генерируются через `bun db:generate`, applied SQL не переписывается. Изменения UI используют kit и матрицу phone/desktop × light/dark × EN/RU; ошибки пополняют bug-lessons с проверкой класса.

Для данной реализации действует последнее указание владельца: без полного exploratory QA, с точечным реальным E2E по новым фичам. Правила самого незавершённого редизайна не изменяются этим документом. До merge нужны review и зелёный CI; локальная разработка не публикует релиз и не меняет production.

## Статус исполнения

Исходный план составлен по публичной истории и checkout PR #54. После разрешения владельца настроено окружение, зафиксированы версии источников плагинов, выполнен риск-анализ и начата реализация. Текущие коммиты, проверки и ограничения отражены в [ledger](technical-execution/ledger.md); исполняемые задачи — в [implementation-plan](technical-execution/implementation-plan.md).

Синтетические измерения не заменяют production-метрики. Успешные локальные тесты не заменяют запуск APK на эмуляторе или проверку FCM на устройстве. Публикация, изменение production-конфигурации и удаление данных не выполнялись.
