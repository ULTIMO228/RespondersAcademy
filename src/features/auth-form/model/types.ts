/** Значения полей формы входа (строки — как введено; номер АРМ приводится к числу при отправке). */
export type AuthCredentials = {
  login: string;
  password: string;
  armNumber: string;
};

export type AuthStep = "credentials" | "code";
