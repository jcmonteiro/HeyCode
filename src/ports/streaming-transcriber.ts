import type { Transcript } from "../domain/transcript.js"

/**
 * Port (interface) for streaming transcription.
 *
 * Unlike TranscriberPort (which transcribes a file), this port handles
 * real-time audio capture and transcription in a single pipeline.
 */
export interface StreamingTranscriberPort {
  /** Start capturing and transcribing. Calls onPartial with incremental results. */
  start(opts?: { onPartial?: (text: string) => void }): Promise<void>
  /** Stop streaming and return the final accumulated transcript. */
  stop(): Promise<Transcript>
  /** Whether the stream is currently active. */
  isActive(): boolean
}

/**
 * Guard: throws if the given object does not satisfy StreamingTranscriberPort.
 */
export function assertStreamingTranscriberPort(obj: unknown): asserts obj is StreamingTranscriberPort {
  const o = obj as Record<string, unknown> | null | undefined
  for (const method of ["start", "stop", "isActive"] as const) {
    if (typeof o?.[method] !== "function") {
      throw new TypeError(`StreamingTranscriberPort requires method "${method}"`)
    }
  }
}
