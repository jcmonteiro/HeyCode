/**
 * Immutable value object representing a transcription result.
 *
 * @typedef {Object} TranscriptMeta
 * @property {string} provider - Which transcription engine produced this result.
 * @property {string} [model]  - Model identifier (e.g. "ggml-tiny.en.bin").
 */
export class Transcript {
  /** @param {{ text: string, meta?: TranscriptMeta }} props */
  constructor({ text, meta }) {
    if (typeof text !== "string") {
      throw new TypeError("Transcript text must be a string")
    }
    /** @readonly */
    this.text = text
    /** @readonly */
    this.meta = Object.freeze(meta ?? {})
    Object.freeze(this)
  }

  /** True when the transcription produced no speech content. */
  get isEmpty() {
    return this.text.trim().length === 0
  }
}
