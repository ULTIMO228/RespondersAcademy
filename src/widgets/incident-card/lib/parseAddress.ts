export type AddressFields = {
  country: string;
  subject: string;
  locality: string;
  okrug: string;
  raion: string;
  street: string;
  house: string;
  building: string;
  entrance: string;
  floor: string;
  descriptive: string;
};

type AddressSource = { formal: string; okrug: string; raion: string; descriptive: string };

const DISTRICT_GROUP = /\([^()]*\)/g;
const FEDERAL_CITY = "Москва";
const DEFAULT_COUNTRY = "Россия";
const FLOOR_IN_TEXT = /(\d+)\s*этаж/;
const PREFIX_FIELDS: { prefix: string; field: "building" | "entrance" | "floor" }[] = [
  { prefix: "к. ", field: "building" },
  { prefix: "под. ", field: "entrance" },
  { prefix: "эт. ", field: "floor" },
];

function assignToken(fields: AddressFields, token: string) {
  const prefixed = PREFIX_FIELDS.find(({ prefix }) => token.startsWith(prefix));
  if (prefixed) {
    fields[prefixed.field] = token.slice(prefixed.prefix.length);
    return;
  }
  if (/^\d/.test(token) && !fields.house) fields.house = token;
  else if (/^\d/.test(token) || token.startsWith("кв. ") || token.startsWith("стр. ")) return;
  else if (!fields.street) fields.street = token;
}

/**
 * Раскладка адреса фикстуры по полям блока «Адрес» (spec п. 3): «Россия, Москва, (ЮАО, Чертаново Южное),
 * Чертановская улица, 58, к. 2, под. 2». Для Москвы (город федерального значения) Нас. пункт = Субъект.
 */
export function parseAddress(address: AddressSource): AddressFields {
  const tokens = address.formal
    .replace(DISTRICT_GROUP, "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const country = tokens[0] === DEFAULT_COUNTRY ? (tokens.shift() ?? DEFAULT_COUNTRY) : DEFAULT_COUNTRY;
  const subject = tokens.shift() ?? "";
  const fields: AddressFields = {
    country,
    subject,
    locality: subject === FEDERAL_CITY ? FEDERAL_CITY : "",
    okrug: address.okrug,
    raion: address.raion,
    street: "",
    house: "",
    building: "",
    entrance: "",
    floor: FLOOR_IN_TEXT.exec(address.descriptive)?.[1] ?? "",
    descriptive: address.descriptive,
  };
  tokens.forEach((token) => assignToken(fields, token));
  return fields;
}
