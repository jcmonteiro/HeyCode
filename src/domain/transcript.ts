export interface TranscriptMeta {
  readonly provider?: string
  readonly model?: string
}

/**
 * Immutable value object representing a transcription result.
 */
export class Transcript {
  readonly text: string
  readonly meta: Readonly<TranscriptMeta>

  constructor({ text, meta }: { text: string; meta?: TranscriptMeta }) {
    if (typeof text !== "string") {
      throw new TypeError("Transcript text must be a string")
    }
    this.text = text
    this.meta = Object.freeze(meta ?? {})
    Object.freeze(this)
  }

  /** True when the transcription produced no speech content. */
  get isEmpty(): boolean {
    return this.text.trim().length === 0
  }
}
