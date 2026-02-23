import type { Transcript } from "../domain/transcript.js"

/**
 * Port (interface) for audio transcription.
 *
 * Adapters implement this contract to convert audio files into text.
 * The core use cases depend only on this shape, never on a concrete adapter.
 */
export interface TranscriberPort {
  /** Transcribe an audio file. Returns a Transcript value object. */
  transcribe(filePath: string): Promise<Transcript>
}

/**
 * Guard: throws if the given object does not satisfy TranscriberPort.
 */
export function assertTranscriberPort(obj: unknown): asserts obj is TranscriberPort {
  const o = obj as Record<string, unknown> | null | undefined
  if (typeof o?.transcribe !== "function") {
    throw new TypeError('TranscriberPort requires method "transcribe"')
  }
}
