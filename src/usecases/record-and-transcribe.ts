import type { RecorderPort } from "../ports/recorder.js"
import type { TranscriberPort } from "../ports/transcriber.js"
import type { Transcript } from "../domain/transcript.js"
import { supportsWaitForStop } from "../ports/recorder.js"

type RecordAndTranscribeResult =
  | { action: "started" }
  | { action: "stopped"; transcript: Transcript }
  | { action: "cancelled" }

interface RecordAndTranscribeOpts {
  recorder: RecorderPort
  transcriber: TranscriberPort
  vadEnabled?: boolean
  onStarted?: () => void
  onStopped?: (outputPath: string) => void
}

/**
 * Record audio and transcribe it.
 *
 * Unified entry point that handles both toggle mode and VAD auto-stop mode:
 *
 * **Toggle mode** (vadEnabled=false or recorder lacks waitForStop):
 *   - If idle → start recording, return { action: "started" }
 *   - If active → stop recording, transcribe, return { action: "stopped", transcript }
 *
 * **VAD mode** (vadEnabled=true and recorder supports waitForStop):
 *   - If idle → start, wait for auto-stop, transcribe, return { action: "stopped", transcript }
 *   - If active → force-stop (escape hatch), return { action: "cancelled" }
 *
 * Pure orchestration — depends only on RecorderPort, TranscriberPort, and domain.
 */
export async function recordAndTranscribe({
  recorder,
  transcriber,
  vadEnabled = false,
  onStarted,
  onStopped,
}: RecordAndTranscribeOpts): Promise<RecordAndTranscribeResult> {
  const useVad = vadEnabled && supportsWaitForStop(recorder)
  const status = await recorder.status()

  // VAD mode: active recording → force-stop (escape hatch)
  if (useVad && status) {
    await recorder.stop()
    return { action: "cancelled" }
  }

  // VAD mode: idle → start, wait for auto-stop, transcribe
  if (useVad) {
    await recorder.start()
    onStarted?.()

    const outputPath = await recorder.waitForStop()
    onStopped?.(outputPath)

    const transcript = await transcriber.transcribe(outputPath)
    return { action: "stopped", transcript }
  }

  // Toggle mode: active → stop + transcribe
  if (status) {
    const outputPath = await recorder.stop()
    onStopped?.(outputPath)

    const transcript = await transcriber.transcribe(outputPath)
    return { action: "stopped", transcript }
  }

  // Toggle mode: idle → start
  await recorder.start()
  onStarted?.()
  return { action: "started" }
}
