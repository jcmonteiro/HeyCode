/**
 * Port (interface) for audio recording.
 *
 * Adapters implement this contract to provide recording capabilities.
 * The core use cases depend only on this shape, never on a concrete adapter.
 *
 * @typedef {Object} RecorderPort
 * @property {() => Promise<string>}           start  - Begin recording. Returns the output file path. Throws RecordingAlreadyActiveError if already recording.
 * @property {() => Promise<string>}           stop   - Stop recording. Returns the output file path. Throws NoActiveRecordingError if idle.
 * @property {() => Promise<import('../domain/recording.js').Recording | null>} status - Current recording state, or null if idle.
 */

/**
 * Guard: throws if the given object does not satisfy RecorderPort.
 * Used in factories and tests to catch wiring mistakes early.
 *
 * @param {unknown} obj
 * @returns {asserts obj is RecorderPort}
 */
export function assertRecorderPort(obj) {
  for (const method of ["start", "stop", "status"]) {
    if (typeof obj?.[method] !== "function") {
      throw new TypeError(`RecorderPort requires method "${method}"`)
    }
  }
}
