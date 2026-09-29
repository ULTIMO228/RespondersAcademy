export type PasswordChangeInput = { currentPassword: string; newPassword: string; confirmPassword: string };

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeInput, string>>;

/** Длина пароля по умолчанию, пока политика сервера не загружена (сервер проверит окончательно). */
export const DEFAULT_MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_MESSAGES = {
  currentRequired: "Введите текущий пароль",
  tooShort: (min: number) => `Пароль должен содержать не менее ${min} символов`,
  sameAsCurrent: "Новый пароль должен отличаться от текущего",
  mismatch: "Пароли не совпадают",
} as const;

/** Проверка формы до запроса: пустые поля, длина по политике, отличие от текущего, совпадение подтверждения. */
export function validatePasswordChange(input: PasswordChangeInput, minLength: number): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!input.currentPassword) errors.currentPassword = PASSWORD_MESSAGES.currentRequired;
  if (input.newPassword.length < minLength) errors.newPassword = PASSWORD_MESSAGES.tooShort(minLength);
  else if (input.newPassword === input.currentPassword) errors.newPassword = PASSWORD_MESSAGES.sameAsCurrent;
  if (input.confirmPassword !== input.newPassword) errors.confirmPassword = PASSWORD_MESSAGES.mismatch;
  return errors;
}
