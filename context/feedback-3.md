# Feedback round 3 («pace замечания 3», 2026-10-11)

The user's third feedback document, verbatim as text. Screenshots are replaced by their
descriptions in [brackets]; a caption follows the screenshot it is about. The request that
came with it: «реализуй что тут написано. думай продуктово пж». What was done about each
point is in `plan.md` (Stage 7).

> [Screenshot: the web update bar across the top of the page — a lime band «We changed a few
> things [Reload]» over the Now header.]

ПОЧЕМУ ЭТО ТАКОЙ ПРОТИВНО КИСЛОТНЫЙ ЖЕЛТЫЙ ЦВЕТ
Бляя давай поменяем
И текст тоже надо улучшить

> [Screenshot: the sidebar's lime «+ New task» button.]

И тут тоже, давай в целом в палитре поменяем

> [Screenshot: Now — a lone «All» chip above the task list, no other filter chips.]

Что тут фильтр All означает? Почему он есть, если он ни по чему не фильтрует?

> [Screenshot: the composer with «123» typed, the hint «Enter adds a short line as it is. A
> pasted message is parsed into a form.» and three buttons: lime «Parse», «Fill in by hand»,
> «To Inbox».]

Я ожидаю что могу набрать какой-то текст, нажать Enter и оно начнет парситься (, потом здесь же
без открытия всяких дополнительных окон оно распарсится в формочку, я эту формочку посмотрю
глазами и вторым Enter задача появится. Fill in by hand как такового не должно быть, должна быть
формочка как раньше (если я ее раскрываю – ввод перекидывается в название, а дальше я
проставляю поля сам). Плюс должна быть анимка раскрытия/сворачивания

> [Screenshot: task page, «Progress 2 / 10» card with a slider.]

Вот это после сохранения дергается + число справа обновляется только после отпускания мышки, а
не вместе с движением. И го в процентах

> [Screenshot: the «Original message ⌄» disclosure on the task page.]

Как будто логично что это полезно только если это парсилось ллмкой, сохранять и показывать иначе
незачем

Work left
21m
Est. 30m

Вот это в целом можно так же в зависимости от поргресса показывать уже локально

> [Screenshot: task footer — «⏱ Focus» and the lime «Done».]

Для пк можно добавить хоткеи и показывать их на кнопках. И нужно учитывать ОС соответственно – в
целом для всех кнопок где есть хоткеи (ну там где мы пишем текст, только для иконок ну не надо)

What are you doing? – после ввода показывтаь текст пока он не распарсится это прикольно. Но
давай контуром, чтобы было видно что это как бы драфт, а не отдельная категория

> [Screenshot: Now rows «123» with Personal and Normal tags.]

А го сюда после того как я отметил что это выполнено анимку такую же как при удалении сообщения
в тг (как будто оно растворяется на пиксели).

> [Screenshot: task page tags «Normal» and «In progress», both gray.]

Плохой дизайн: два серых. Для In progress лучше подходит голубой/фиол. Для Normal – хз, зеленый
Для Personal цвет чуть покраснее, как в гугл календаре дефолтный оранжевый

> [Screenshot: the task header's ⓧ icon (circle with a cross).]

Неверная иконка, должно быть кружок с диагональной палочкой
Плюс нет кнопки удаления

> [Screenshot: desktop, the «Close task» sheet sliding up from the bottom edge over the list:
> Cancelled / Skipped, Reason, When did you close it? (Now, 1h ago, Yesterday evening, 📅),
> «Exact time — Off = “about then”» switch, the preview, «Back» and «Close as Cancelled».]

Плюс мы с пк показываем так как будто на телефонах. А на пк ожидается что у нас плашка появится
по центру а не вот так

> [Screenshot: the «Exact time» switch.]

Ну тут вместо слайдера лучше опять же такие же кнопки как в остальных полях, чтобы было видно
между чем выбор
Back бесполезен, на телефонах мы тыкаем на свободное пространство, на компах так же либо тыкаем
на крестик (или я не прав? Посмотри какая конвенция вообще)
Совершенно непонятно зачем нужна кнопка + на мобилках если она просто вставляет указатель в поле
ввода. Лучше эту кнопку убрать но зато в панель добавить настройки. А с главной настройки убрать.
Почему мы это не отлаливаем? Это же очевидный ui/ux паттерн
