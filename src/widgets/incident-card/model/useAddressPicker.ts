"use client";

import { useState } from "react";

import { findNearestAddress, formatAddress, searchAddresses, toAddressFields } from "../lib/addressDirectory";
import type { AddressEntry } from "../lib/addressDirectory";
import { projectGeoToMap, unprojectMapPoint } from "../lib/mapPoint";
import type { MapPoint } from "../lib/mapPoint";
import { parseAddress } from "../lib/parseAddress";
import type { AddressFields } from "../lib/parseAddress";
import type { IncidentCardData } from "../model/types";

type CardAddress = IncidentCardData["address"];

/**
 * Адресная строка с вариантами локального справочника (T2.3-06): выбор варианта заполняет все поля,
 * «Указать на карте» ставит отметку и подставляет ближайший адрес справочника.
 */
export function useAddressPicker(address: CardAddress) {
  const [query, setQuery] = useState(address.formal);
  const [fields, setFields] = useState<AddressFields>(() => parseAddress(address));
  const [point, setPoint] = useState<MapPoint | null>(() => projectGeoToMap(address.geo));
  const [isSuggestOpen, setSuggestOpen] = useState(false);
  const suggestions = searchAddresses(query === address.formal ? "" : query);

  function select(entry: AddressEntry) {
    setFields(toAddressFields(entry));
    setQuery(formatAddress(entry));
    setPoint(projectGeoToMap(entry.geo));
    setSuggestOpen(false);
  }

  function pickOnMap(nextPoint: MapPoint) {
    setPoint(nextPoint);
    const nearest = findNearestAddress(unprojectMapPoint(nextPoint));
    if (!nearest) return;
    setFields(toAddressFields(nearest));
    setQuery(formatAddress(nearest));
  }

  function changeQuery(value: string) {
    setQuery(value);
    setSuggestOpen(true);
  }

  return { query, fields, point, suggestions, isSuggestOpen, setSuggestOpen, changeQuery, select, pickOnMap };
}
