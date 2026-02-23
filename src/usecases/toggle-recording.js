/**
 * Toggle recording: starts if idle, stops if active.
 *
 * Pure orchestration — depends only on the RecorderPort contract.
 *
 * @param {{ recorder: import('../ports/recorder.js').RecorderPort }} deps
 * @returns {Promise<{ action: 'started' } | { action: 'stopped', outputPath: string }>}
 */
export async function toggleRecording({ recorder }) {
  const current = await recorder.status()

  if (current) {
    const outputPath = await recorder.stop()
    return { action: "stopped", outputPath }
  }

  await recorder.start()
  return { action: "started" }
}
