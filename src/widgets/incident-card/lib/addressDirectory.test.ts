import { describe, expect, it } from "vitest";

import { clampToViewport } from "../model/useDraggable";
import { ADDRESS_DIRECTORY, findNearestAddress, formatAddress, searchAddresses } from "./addressDirectory";
import { buildSmsPolygon, projectGeoToMap, unprojectMapPoint } from "./mapPoint";

/* Валидность локального справочника mocks/local/addresses.json (spec/mocks и validate_mocks.py не расширяются). */
describe("локальный справочник адресов (T2.3-06)", () => {
  it("записи валидны: уникальные id, обязательные поля, координаты в границах карты Москвы", () => {
    const ids = new Set(ADDRESS_DIRECTORY.map((entry) => entry.id));
    expect(ids.size).toBe(ADDRESS_DIRECTORY.length);
    ADDRESS_DIRECTORY.forEach((entry) => {
      expect(entry).toMatchObject({ country: "Россия", subject: "Москва", locality: "Москва" });
      expect(entry.okrug && entry.raion && entry.street).toBeTruthy();
      const point = projectGeoToMap(entry.geo);
      expect(point && point.xPercent > 0 && point.xPercent < 100).toBe(true);
    });
  });

  it("формат ПОВ-112 и поиск без учёта регистра и «ё/е»", () => {
    const [entry] = searchAddresses("чертановская 58");
    expect(formatAddress(entry)).toBe(
      "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58, к. 2, под. 2",
    );
    expect(searchAddresses("ЗЮЗИНО").length).toBeGreaterThan(1);
    expect(searchAddresses("нет такого адреса")).toEqual([]);
  });

  it("клик по карте → ближайший адрес; проекция обратима; полигон из 6 вершин", () => {
    const geo = { lat: 55.642, lon: 37.612 };
    const back = unprojectMapPoint(projectGeoToMap(geo)!);
    expect(back.lat).toBeCloseTo(geo.lat, 5);
    expect(findNearestAddress(back)?.street).toBe("Балаклавский проспект");
    expect(buildSmsPolygon({ xPercent: 50, yPercent: 50 }).split(" ")).toHaveLength(6);
  });

  it("окно не выходит за пределы вьюпорта", () => {
    const size = { width: 300, height: 200 };
    const viewport = { width: 1000, height: 700 };
    expect(clampToViewport({ x: -50, y: 900 }, size, viewport)).toEqual({ x: 0, y: 500 });
    expect(clampToViewport({ x: 900, y: 10 }, size, viewport)).toEqual({ x: 700, y: 10 });
  });
});
