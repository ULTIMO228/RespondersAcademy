/** Только проверка разрешения; захват отдельной реплики выполняет AudioRecorder. */
export async function requestMicrophone(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Микрофон недоступен. Откройте тренажёр по HTTPS или localhost");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    throw new Error("Разрешите доступ к микрофону и проверьте подключение гарнитуры");
  }
}
