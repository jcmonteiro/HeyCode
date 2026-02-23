import { describe, it, expect } from "vitest"
import { createTranscriber } from "../factories/create-transcriber.js"
import { TranscriberConfigError } from "../domain/errors.js"

describe("createTranscriber", () => {
  it("creates a whisper.cpp transcriber from config", () => {
    const config = {
      provider: {
        type: "whisper.cpp",
        whisperCpp: { bin: "whisper-cli", model: "/m", language: "auto" },
      },
    }
    const t = createTranscriber(config)
    expect(typeof t.transcribe).toBe("function")
  })

  it("creates an openai transcriber from config", () => {
    const config = {
      provider: {
        type: "openai",
        openai: { apiKey: "sk-test", model: "whisper-1" },
      },
    }
    const t = createTranscriber(config)
    expect(typeof t.transcribe).toBe("function")
  })

  it("throws for unknown provider type", () => {
    const config = { provider: { type: "unknown" } }
    expect(() => createTranscriber(config)).toThrow(/unknown/)
  })

  it("throws TranscriberConfigError for whisper.cpp without model", () => {
    const config = {
      provider: {
        type: "whisper.cpp",
        whisperCpp: { bin: "whisper-cli", model: "" },
      },
    }
    expect(() => createTranscriber(config)).toThrow(TranscriberConfigError)
  })

  it("throws TranscriberConfigError for openai without apiKey", () => {
    const config = {
      provider: {
        type: "openai",
        openai: { apiKey: "" },
      },
    }
    expect(() => createTranscriber(config)).toThrow(TranscriberConfigError)
  })
})
