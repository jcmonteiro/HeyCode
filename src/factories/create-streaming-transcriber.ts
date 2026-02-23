/**
 * Factory: create a StreamingTranscriberPort from config.
 */
import { createWhisperStreamTranscriber } from "../adapters/whisper-stream-transcriber.js"
import type { StreamingTranscriberPort } from "../ports/streaming-transcriber.js"
import type { HeycodeConfig } from "../config/config.js"

export function createStreamingTranscriber(config: HeycodeConfig): StreamingTranscriberPort {
  const w = config.provider?.whisperCpp ?? { model: "", bin: "whisper-cli", language: "auto", extraArgs: [] }
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
