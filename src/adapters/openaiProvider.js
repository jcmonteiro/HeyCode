import { Transcript } from "../domain/transcript.js"
import fs from "node:fs/promises"

const normalizeText = (text) => text.replace(/\s+/g, " ").trim()

export class OpenAIProvider {
  constructor(config) {
    this.config = config
  }

  async transcribeFile(filePath) {
    const openaiConfig = this.config.provider.openai
    if (!openaiConfig.apiKey) {
      throw new Error("OPENAI_API_KEY is required for OpenAI transcription")
    }

    const form = new FormData()
    const buffer = await fs.readFile(filePath)
    const file = new File([buffer], "audio.wav", { type: "audio/wav" })
    form.append("file", file)
    form.append("model", openaiConfig.model || "whisper-1")
    if (openaiConfig.language) {
      form.append("language", openaiConfig.language)
    }

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiConfig.apiKey}`,
      },
      body: form,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI transcription failed: ${errorText}`)
    }

    const data = await response.json()
    const text = normalizeText(data.text || "")
    return new Transcript({
      text,
      meta: {
        provider: "openai",
        model: openaiConfig.model || "whisper-1",
      },
    })
  }
}
