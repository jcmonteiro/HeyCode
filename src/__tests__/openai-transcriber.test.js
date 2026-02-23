import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs/promises"
import { TranscriberConfigError, TranscriptionFailedError } from "../domain/errors.js"

// We need to mock fetch for OpenAI API calls
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

const { createOpenAITranscriber } = await import("../adapters/openai-transcriber.js")

describe("createOpenAITranscriber", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("throws TranscriberConfigError if apiKey is missing", () => {
    expect(() => createOpenAITranscriber({ apiKey: "" }))
      .toThrow(TranscriberConfigError)
  })

  it("creates a valid TranscriberPort", () => {
    const t = createOpenAITranscriber({ apiKey: "sk-test" })
    expect(typeof t.transcribe).toBe("function")
  })

  it("calls OpenAI API with correct headers and model", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("fake-audio"))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "  hello   world  " }),
    })

    const t = createOpenAITranscriber({
      apiKey: "sk-test-key",
      model: "whisper-1",
      language: "en",
    })

    const result = await t.transcribe("/tmp/audio.wav")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer sk-test-key" },
      }),
    )

    // Text should be normalized
    expect(result.text).toBe("hello world")
    expect(result.meta.provider).toBe("openai")
    expect(result.meta.model).toBe("whisper-1")
  })

  it("normalizes whitespace in transcription output", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("audio"))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "  lots   of   spaces  \n\n  here  " }),
    })

    const t = createOpenAITranscriber({ apiKey: "sk-test" })
    const result = await t.transcribe("/tmp/audio.wav")

    expect(result.text).toBe("lots of spaces here")
  })

  it("returns empty transcript for empty response", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("audio"))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "" }),
    })

    const t = createOpenAITranscriber({ apiKey: "sk-test" })
    const result = await t.transcribe("/tmp/audio.wav")

    expect(result.isEmpty).toBe(true)
  })

  it("wraps API errors in TranscriptionFailedError", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("audio"))

    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => "Unauthorized",
    })

    const t = createOpenAITranscriber({ apiKey: "sk-bad-key" })
    await expect(t.transcribe("/tmp/audio.wav"))
      .rejects.toThrow(TranscriptionFailedError)
  })

  it("defaults to whisper-1 model when not specified", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("audio"))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "test" }),
    })

    const t = createOpenAITranscriber({ apiKey: "sk-test" })
    const result = await t.transcribe("/tmp/audio.wav")

    expect(result.meta.model).toBe("whisper-1")
  })
})
