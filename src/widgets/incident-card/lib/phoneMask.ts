import { PHONE_MASK_TEMPLATE } from "../config/constants";

const MASK_SLOT = "_";
const NATIONAL_NUMBER_LENGTH = 10;
const TRUNK_PREFIXES = ["7", "8"];

function toNationalDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  const hasTrunkPrefix =
    digits.length > NATIONAL_NUMBER_LENGTH || (digits.length > 0 && input.trim().startsWith("+"));
  const national = hasTrunkPrefix && TRUNK_PREFIXES.includes(digits[0]) ? digits.slice(1) : digits;
  return national.slice(0, NATIONAL_NUMBER_LENGTH);
}

/** Маска телефона ПОВ-112: «+7 (977) 567-5_-__». Пустой ввод — пустая строка (показывается шаблон). */
export function formatPhoneMask(input: string): string {
  const digits = toNationalDigits(input);
  if (!digits) return "";
  let digitIndex = 0;
  return Array.from(PHONE_MASK_TEMPLATE)
    .map((char) => {
      if (char !== MASK_SLOT) return char;
      const digit = digits[digitIndex] ?? MASK_SLOT;
      digitIndex += 1;
      return digit;
    })
    .join("");
}

/** Ввод в поле с маской: хранит 10 национальных цифр; Backspace по символу маски удаляет последнюю цифру. */
export function applyPhoneInput(previousDigits: string, nextInput: string): string {
  const nextDigits = toNationalDigits(nextInput);
  const isDeletion = nextInput.length < formatPhoneMask(previousDigits).length;
  if (isDeletion && nextDigits === previousDigits) return previousDigits.slice(0, -1);
  return nextDigits;
}
