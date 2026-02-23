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

const normalizeText = (text) => text.replace(/\s+/g, " ").trim()

/**
 * Create an OpenAI transcriber that satisfies TranscriberPort.
 *
 * @param {{ apiKey: string, model?: string, language?: string }} opts
 * @returns {import('../ports/transcriber.js').TranscriberPort}
 */
export function createOpenAITranscriber({ apiKey, model, language }) {
  if (!apiKey) throw new TranscriberConfigError("OPENAI_API_KEY is required for OpenAI transcription")

  const effectiveModel = model || "whisper-1"

  return {
    async transcribe(filePath) {
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

      const data = await response.json()
      const text = normalizeText(data.text || "")

      return new Transcript({
        text,
        meta: { provider: "openai", model: effectiveModel },
      })
    },
  }
}
