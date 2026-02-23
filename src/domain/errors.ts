/** Base error for all speech-related failures. */
export class SpeechError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpeechError"
  }
}

/** Thrown when a recording is requested but one is already active. */
export class RecordingAlreadyActiveError extends SpeechError {
  constructor() {
    super("Recording already in progress")
    this.name = "RecordingAlreadyActiveError"
  }
}

/** Thrown when a stop is requested but nothing is recording. */
export class NoActiveRecordingError extends SpeechError {
  constructor() {
    super("No recording in progress")
    this.name = "NoActiveRecordingError"
  }
}

/** Thrown when the recorder binary fails to start within the timeout. */
export class RecorderStartTimeoutError extends SpeechError {
  constructor(ms: number) {
    super(`Recording failed to start within ${ms}ms`)
    this.name = "RecorderStartTimeoutError"
  }
}

/** Thrown when transcription configuration is invalid. */
export class TranscriberConfigError extends SpeechError {
  constructor(detail: string) {
    super(`Transcriber misconfigured: ${detail}`)
    this.name = "TranscriberConfigError"
  }
}

/** Thrown when the transcription engine fails. */
export class TranscriptionFailedError extends SpeechError {
  constructor(provider: string, detail: string) {
    super(`${provider} transcription failed: ${detail}`)
    this.name = "TranscriptionFailedError"
  }
}
