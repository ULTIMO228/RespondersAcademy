/** Значения полей формы входа платформы: логин и пароль (номер АРМ платформе не нужен, 2FA не реализуется — A14). */
export type AuthCredentials = {
  login: string;
  password: string;
};
