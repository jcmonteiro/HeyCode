/**
 * Factory: create a TranscriberPort from config.
 */
import { createWhisperCppTranscriber } from "../adapters/whisper-cpp-transcriber.js"
import { createOpenAITranscriber } from "../adapters/openai-transcriber.js"
import type { TranscriberPort } from "../ports/transcriber.js"
import type { HeyCodeConfig } from "../config/config.js"

export function createTranscriber(config: HeyCodeConfig): TranscriberPort {
  const providerType = config.provider?.type

  if (providerType === "whisper.cpp") {
    const w = config.provider.whisperCpp
    return createWhisperCppTranscriber({
      bin: w.bin,
      model: w.model,
      language: w.language,
      threads: w.threads,
      extraArgs: w.extraArgs,
    })
  }

  if (providerType === "openai") {
    const o = config.provider.openai
    return createOpenAITranscriber({
      apiKey: o.apiKey,
      model: o.model,
      language: o.language,
    })
  }

  throw new Error(`Unsupported transcription provider: ${providerType}`)
}
