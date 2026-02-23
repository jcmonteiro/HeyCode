/**
 * Port (interface) for audio transcription.
 *
 * Adapters implement this contract to convert audio files into text.
 * The core use cases depend only on this shape, never on a concrete adapter.
 *
 * @typedef {Object} TranscriberPort
 * @property {(filePath: string) => Promise<import('../domain/transcript.js').Transcript>} transcribe - Transcribe an audio file. Returns a Transcript value object.
 */

/**
 * Guard: throws if the given object does not satisfy TranscriberPort.
 *
 * @param {unknown} obj
 * @returns {asserts obj is TranscriberPort}
 */
export function assertTranscriberPort(obj) {
  if (typeof obj?.transcribe !== "function") {
    throw new TypeError('TranscriberPort requires method "transcribe"')
  }
}
