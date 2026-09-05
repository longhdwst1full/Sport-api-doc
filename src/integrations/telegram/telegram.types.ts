export interface TelegramUser {
  id: number;
}

export interface TelegramChat {
  id: number;
}

export interface TelegramMessage {
  text?: string;
  from?: TelegramUser;
  chat: TelegramChat;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}
