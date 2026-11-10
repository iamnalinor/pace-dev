import type { enAccount } from "../en/account.ts";

/** The Telegram bot's questions and answers when the person wipes their data or deletes the account. */
export const ruAccount: { readonly [K in keyof typeof enAccount]: string } = {
  "account.wipePrompt": "Подтвердить удаление всех данных Pace? Аккаунт и входы сохранятся.",
  "account.deletePrompt": "Подтвердить удаление аккаунта Pace и всех его данных?",
  "account.confirm": "Подтвердить",
  "account.cancel": "Отмена",
  "account.replaced": "Запрос заменён более новым.",
  "account.expired": "Срок запроса истёк.",
  "account.alreadyHandled": "Этот запрос уже обработан.",
  "account.cancelled": "Запрос отменён.",
  "account.wiped": "Все данные очищены.",
  "account.deleted": "Аккаунт удалён.",
  "account.failed": "Не удалось выполнить запрос. Попробуйте ещё раз.",
  "account.inProgress":
    "Выполняется. Это может занять несколько минут: нажмите «Подтвердить» ещё раз, чтобы проверить.",
  "account.unknown": "Неизвестный запрос.",
  "account.notYours": "Этот запрос вам не принадлежит.",
};
