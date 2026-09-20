import type { CallVoice } from "@/shared/api";

import { VOICE_TITLES } from "../config/callControl";

const SPEECH_NOTE = "речь эмулируется текстом (аудио опционально)";

/** Текстовая пометка вариативности голоса ИИ-абонента (м/ж, служба) — Q&A в8. */
export function getVoiceNote(voice: CallVoice | null, subscriberTitle: string): string {
  if (!voice) return `ИИ-абонент «${subscriberTitle}» — ${SPEECH_NOTE}`;
  return `Голос ИИ-абонента: ${VOICE_TITLES[voice]}, «${subscriberTitle}» — ${SPEECH_NOTE}`;
}
