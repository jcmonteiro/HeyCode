import type { RecorderPort } from "../ports/recorder.js"

type ToggleResult =
  | { action: "started" }
  | { action: "stopped"; outputPath: string }

/**
 * Toggle recording: starts if idle, stops if active.
 *
 * Pure orchestration — depends only on the RecorderPort contract.
 */
export async function toggleRecording({ recorder }: { recorder: RecorderPort }): Promise<ToggleResult> {
  const current = await recorder.status()

  if (current) {
    const outputPath = await recorder.stop()
    return { action: "stopped", outputPath }
  }

  await recorder.start()
  return { action: "started" }
}
