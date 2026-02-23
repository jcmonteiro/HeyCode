/**
 * OpenAI Whisper API transcriber adapter.
 *
 * Implements TranscriberPort by calling the OpenAI transcription endpoint.
 */
import fs from "node:fs/promises"
import { Transcript } from "../domain/transcript.js"
import {
  TranscriberConfigError,
  TranscriptionFailedError,
} from "../domain/errors.js"
import type { TranscriberPort } from "../ports/transcriber.js"

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim()

interface OpenAIOpts {
  apiKey: string
  model?: string
  language?: string
}

/**
 * Create an OpenAI transcriber that satisfies TranscriberPort.
 */
export function createOpenAITranscriber({ apiKey, model, language }: OpenAIOpts): TranscriberPort {
  if (!apiKey) throw new TranscriberConfigError("OPENAI_API_KEY is required for OpenAI transcription")

  const effectiveModel = model || "whisper-1"

  return {
    async transcribe(filePath: string): Promise<Transcript> {
      const buffer = await fs.readFile(filePath)
      const file = new File([buffer], "audio.wav", { type: "audio/wav" })

      const form = new FormData()
      form.append("file", file)
      form.append("model", effectiveModel)
      if (language) {
        form.append("language", language)
      }

      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
      )

      if (!response.ok) {
        const detail = await response.text()
        throw new TranscriptionFailedError("openai", detail)
      }

      const data = (await response.json()) as { text?: string }
      const text = normalizeText(data.text || "")

      return new Transcript({
        text,
        meta: { provider: "openai", model: effectiveModel },
      })
    },
  }
}
