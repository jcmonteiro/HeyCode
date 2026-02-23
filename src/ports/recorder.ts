import type { Recording } from "../domain/recording.js"

/**
 * Port (interface) for audio recording.
 *
 * Adapters implement this contract to provide recording capabilities.
 * The core use cases depend only on this shape, never on a concrete adapter.
 */
export interface RecorderPort {
  /** Begin recording. Returns the output file path. */
  start(): Promise<string>
  /** Stop recording. Returns the output file path. */
  stop(): Promise<string>
  /** Current recording state, or null if idle. */
  status(): Promise<Recording | null>
  /** Wait for the recorder to stop (auto-stop via VAD). Optional. */
  waitForStop?(): Promise<string>
}

/**
 * Guard: throws if the given object does not satisfy RecorderPort.
 * Used in factories and tests to catch wiring mistakes early.
 */
export function assertRecorderPort(obj: unknown): asserts obj is RecorderPort {
  const o = obj as Record<string, unknown> | null | undefined
  for (const method of ["start", "stop", "status"] as const) {
    if (typeof o?.[method] !== "function") {
      throw new TypeError(`RecorderPort requires method "${method}"`)
    }
  }
}

/**
 * Check whether a recorder supports the waitForStop capability (VAD auto-stop).
 */
export function supportsWaitForStop(
  recorder: RecorderPort | null | undefined,
): recorder is RecorderPort & { waitForStop(): Promise<string> } {
  return typeof recorder?.waitForStop === "function"
}
