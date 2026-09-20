/* Телефон добавленной отработки хранится в «Куда звонили» после разделителя (в WorkLine нет поля телефона). */
const PHONE_SEPARATOR = " · ";

export function composeCalledTo(calledTo: string, phone: string): string {
  const place = calledTo.trim();
  return phone.trim() ? `${place}${PHONE_SEPARATOR}${phone.trim()}` : place;
}

export function splitCalledTo(calledTo: string): { place: string; phone: string } {
  const [place, phone = ""] = calledTo.split(PHONE_SEPARATOR);
  return { place, phone };
}
