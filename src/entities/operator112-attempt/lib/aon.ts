/** Номер заявителя в виде АРМ-112: «+7 (499) 550-34-56» (ИНСТРУКЦИЯ_4). Нестандартная длина — как есть. */
export function formatAon(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && (digits[0] === "7" || digits[0] === "8") ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 8)}-${local.slice(8)}`;
}
