"use client";

import { useState } from "react";

import { Button } from "@/shared/ui";

import type { IncidentCardData } from "../model/types";
import { useRecordings } from "../model/useRecordings";
import { RecordingsModal } from "./RecordingsModal";

/** Прослушивание записей преподавателем вне заблокированного зеркала курсанта. */
export function RecordingsButton({ card }: { card: IncidentCardData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Записи по карточке
      </Button>
      {open ? <LiveRecordings card={card} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LiveRecordings({ card, onClose }: { card: IncidentCardData; onClose: () => void }) {
  const { recordings, error } = useRecordings(card, true);
  return <RecordingsModal recordings={recordings} error={error} onClose={onClose} />;
}
