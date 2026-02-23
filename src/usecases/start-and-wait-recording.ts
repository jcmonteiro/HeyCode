import type { RecorderPort } from "../ports/recorder.js"
import type { TranscriberPort } from "../ports/transcriber.js"
import type { Transcript } from "../domain/transcript.js"
import { RecordingAlreadyActiveError } from "../domain/errors.js"
import { supportsWaitForStop } from "../ports/recorder.js"

interface StartAndWaitOpts {
  recorder: RecorderPort & { waitForStop(): Promise<string> }
  transcriber: TranscriberPort
  onStarted?: () => void
  onStopped?: (outputPath: string) => void
}

/**
 * Start recording and wait for auto-stop (VAD silence detection).
 *
 * This use case starts the recorder, waits for it to auto-stop (via VAD
 * or external signal), then transcribes the resulting audio file.
 *
 * Requires a recorder that supports `waitForStop` (VAD-capable). Throws
 * TypeError if the recorder does not have this capability.
 *
 * Pure orchestration — depends only on RecorderPort (with waitForStop)
 * and TranscriberPort contracts.
 */
export async function startAndWaitRecording({
  recorder,
  transcriber,
  onStarted,
  onStopped,
}: StartAndWaitOpts): Promise<{ transcript: Transcript }> {
  if (!supportsWaitForStop(recorder)) {
    throw new TypeError("startAndWaitRecording requires a recorder with waitForStop support")
  }

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
