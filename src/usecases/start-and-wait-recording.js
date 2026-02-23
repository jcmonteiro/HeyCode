import { RecordingAlreadyActiveError } from "../domain/errors.js"

/**
 * Start recording and wait for auto-stop (VAD silence detection).
 *
 * This use case starts the recorder, waits for it to auto-stop (via VAD
 * or external signal), then transcribes the resulting audio file.
 *
 * Pure orchestration — depends only on RecorderPort (with waitForStop)
 * and TranscriberPort contracts.
 *
 * @param {{
 *   recorder: import('../ports/recorder.js').RecorderPort,
 *   transcriber: import('../ports/transcriber.js').TranscriberPort,
 *   onStarted?: () => void,
 *   onStopped?: (outputPath: string) => void,
 * }} deps
 * @returns {Promise<{ transcript: import('../domain/transcript.js').Transcript }>}
 */
export async function startAndWaitRecording({ recorder, transcriber, onStarted, onStopped }) {
  const current = await recorder.status()
  if (current) {
    throw new RecordingAlreadyActiveError()
  }

  await recorder.start()
  onStarted?.()

  const outputPath = await recorder.waitForStop()
  onStopped?.(outputPath)

  const transcript = await transcriber.transcribe(outputPath)
  return { transcript }
}
