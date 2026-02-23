/**
 * Port (interface) for streaming transcription.
 *
 * Unlike TranscriberPort (which transcribes a file), this port handles
 * real-time audio capture and transcription in a single pipeline.
 *
 * @typedef {Object} StreamingTranscriberPort
 * @property {(opts?: { onPartial?: (text: string) => void }) => Promise<void>} start - Start capturing and transcribing. Calls onPartial with incremental results.
 * @property {() => Promise<import('../domain/transcript.js').Transcript>} stop - Stop streaming and return the final accumulated transcript.
 * @property {() => boolean} isActive - Whether the stream is currently active.
 */

/**
 * Guard: throws if the given object does not satisfy StreamingTranscriberPort.
 *
 * @param {unknown} obj
 * @returns {asserts obj is StreamingTranscriberPort}
 */
export function assertStreamingTranscriberPort(obj) {
  for (const method of ["start", "stop", "isActive"]) {
    if (typeof obj?.[method] !== "function") {
      throw new TypeError(`StreamingTranscriberPort requires method "${method}"`)
    }
  }
}
