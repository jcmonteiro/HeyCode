/**
 * Transcribe an audio file.
 *
 * Pure orchestration — depends only on the TranscriberPort contract.
 *
 * @param {{ transcriber: import('../ports/transcriber.js').TranscriberPort, filePath: string }} deps
 * @returns {Promise<import('../domain/transcript.js').Transcript>}
 */
export async function transcribeFile({ transcriber, filePath }) {
  return transcriber.transcribe(filePath)
}
