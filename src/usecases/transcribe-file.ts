import type { TranscriberPort } from "../ports/transcriber.js"
import type { Transcript } from "../domain/transcript.js"

/**
 * Transcribe an audio file.
 *
 * Pure orchestration — depends only on the TranscriberPort contract.
 */
export async function transcribeFile({
  transcriber,
  filePath,
}: {
  transcriber: TranscriberPort
  filePath: string
}): Promise<Transcript> {
  return transcriber.transcribe(filePath)
}
