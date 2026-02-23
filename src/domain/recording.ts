/**
 * Immutable value object representing the state of an audio recording.
 *
 * A Recording is either "active" (has a pid and outputPath) or "idle" (null).
 * This type only models active recordings; idle state is represented as null
 * at the call site.
 */
export class Recording {
  readonly pid: number
  readonly outputPath: string

  constructor({ pid, outputPath }: { pid: number; outputPath: string }) {
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new TypeError("Recording pid must be a positive number")
    }
    if (typeof outputPath !== "string" || outputPath.length === 0) {
      throw new TypeError("Recording outputPath must be a non-empty string")
    }
    this.pid = pid
    this.outputPath = outputPath
    Object.freeze(this)
  }
}
