import { describe, it, expect } from "vitest"
import { createTranscriber } from "../factories/create-transcriber.js"
import { createRecorder } from "../factories/create-recorder.js"
import { createStreamingTranscriber } from "../factories/create-streaming-transcriber.js"
import { TranscriberConfigError } from "../domain/errors.js"
import type { HeycodeConfig } from "../config/config.js"

describe("createTranscriber", () => {
  it("creates a whisper.cpp transcriber from config", () => {
    const config = {
      provider: {
        type: "whisper.cpp",
        whisperCpp: { bin: "whisper-cli", model: "/m", language: "auto" },
      },
    } as HeycodeConfig
    const t = createTranscriber(config)
    expect(typeof t.transcribe).toBe("function")
  })

  it("creates an openai transcriber from config", () => {
    const config = {
      provider: {
        type: "openai",
        openai: { apiKey: "sk-test", model: "whisper-1" },
      },
    } as HeycodeConfig
    const t = createTranscriber(config)
    expect(typeof t.transcribe).toBe("function")
  })

  it("throws for unknown provider type", () => {
    const config = { provider: { type: "unknown" } } as HeycodeConfig
    expect(() => createTranscriber(config)).toThrow(/unknown/)
  })

  it("throws TranscriberConfigError for whisper.cpp without model", () => {
    const config = {
      provider: {
        type: "whisper.cpp",
        whisperCpp: { bin: "whisper-cli", model: "" },
      },
    } as HeycodeConfig
    expect(() => createTranscriber(config)).toThrow(TranscriberConfigError)
  })

  it("throws TranscriberConfigError for openai without apiKey", () => {
    const config = {
      provider: {
        type: "openai",
        openai: { apiKey: "" },
      },
    } as HeycodeConfig
    expect(() => createTranscriber(config)).toThrow(TranscriberConfigError)
  })
})

describe("createRecorder", () => {
  it("creates a recorder with start, stop, status methods", () => {
    const config = {
      capture: {
        native: { bin: "/path/to/record" },
        vad: { enabled: true },
      },
    } as HeycodeConfig
    const recorder = createRecorder(config)
    expect(typeof recorder.start).toBe("function")
    expect(typeof recorder.stop).toBe("function")
    expect(typeof recorder.status).toBe("function")
  })

  it("creates a recorder with waitForStop when VAD is configured", () => {
    const config = {
      capture: {
        native: { bin: "/path/to/record" },
        vad: { enabled: true },
      },
    } as HeycodeConfig
    const recorder = createRecorder(config)
    expect(typeof recorder.waitForStop).toBe("function")
  })

  it("falls back to default bin path when not specified", () => {
    const config = { capture: { native: {} } } as HeycodeConfig
    const recorder = createRecorder(config)
    // Should not throw — just uses default path
    expect(typeof recorder.start).toBe("function")
  })
})

describe("createStreamingTranscriber", () => {
  it("creates a streaming transcriber with start, stop, isActive methods", () => {
    const config = {
      provider: {
        whisperCpp: { model: "/m" },
        streaming: { bin: "whisper-stream" },
      },
    } as HeycodeConfig
    const streamer = createStreamingTranscriber(config)
    expect(typeof streamer.start).toBe("function")
    expect(typeof streamer.stop).toBe("function")
    expect(typeof streamer.isActive).toBe("function")
  })

  it("throws TranscriberConfigError if model is missing", () => {
    const config = {
      provider: {
        whisperCpp: { model: "" },
        streaming: { bin: "whisper-stream" },
      },
    } as HeycodeConfig
    expect(() => createStreamingTranscriber(config)).toThrow(TranscriberConfigError)
  })

  it("uses defaults for streaming options", () => {
    const config = {
      provider: {
        whisperCpp: { model: "/m" },
      },
    } as HeycodeConfig
    const streamer = createStreamingTranscriber(config)
    expect(streamer.isActive()).toBe(false)
  })
})
