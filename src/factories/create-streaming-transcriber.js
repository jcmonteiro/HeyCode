/**
 * Factory: create a StreamingTranscriberPort from config.
 */
import { createWhisperStreamTranscriber } from "../adapters/whisper-stream-transcriber.js"

/**
 * @param {object} config - Full application config.
 * @returns {import('../ports/streaming-transcriber.js').StreamingTranscriberPort}
 */
export function createStreamingTranscriber(config) {
  const w = config.provider?.whisperCpp ?? {}
  return createWhisperStreamTranscriber({
    bin: config.provider?.streaming?.bin ?? "whisper-stream",
    model: w.model,
    language: w.language,
    threads: w.threads,
    stepMs: config.provider?.streaming?.stepMs,
    lengthMs: config.provider?.streaming?.lengthMs,
    captureDevice: config.provider?.streaming?.captureDevice,
    vadThreshold: config.provider?.streaming?.vadThreshold,
  })
}
