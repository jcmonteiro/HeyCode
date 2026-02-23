import { describe, it, expect, vi, beforeEach } from "vitest"
import { assertStreamingTranscriberPort } from "../ports/streaming-transcriber.js"

vi.mock("execa", () => ({
  execa: vi.fn(),
}))

describe("assertStreamingTranscriberPort", () => {
  it("accepts valid port", () => {
    const port = { start: () => {}, stop: () => {}, isActive: () => {} }
    expect(() => assertStreamingTranscriberPort(port)).not.toThrow()
  })

  it("rejects missing start", () => {
    expect(() => assertStreamingTranscriberPort({ stop: () => {}, isActive: () => {} }))
      .toThrow(/start/)
  })

  it("rejects missing stop", () => {
    expect(() => assertStreamingTranscriberPort({ start: () => {}, isActive: () => {} }))
      .toThrow(/stop/)
  })

  it("rejects null", () => {
    expect(() => assertStreamingTranscriberPort(null)).toThrow(TypeError)
  })
})

describe("createWhisperStreamTranscriber", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("throws if model is missing", async () => {
    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    expect(() => createWhisperStreamTranscriber({ model: "" }))
      .toThrow(/model/)
  })

  it("starts inactive", async () => {
    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({ model: "/path/to/model.bin" })
    expect(streamer.isActive()).toBe(false)
  })

  it("builds correct args for whisper-stream", async () => {
    const { execa } = await import("execa")
    const { EventEmitter } = await import("node:events")

    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const mockChild = {
      stdout,
      stderr,
      pid: 123,
      kill: vi.fn(),
      catch: vi.fn(),
    }
    execa.mockReturnValue(mockChild)

    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({
      model: "/path/model.bin",
      language: "en",
      threads: 4,
      stepMs: 2000,
      lengthMs: 8000,
    })

    // Start and immediately emit [Start speaking] to resolve the promise
    const startPromise = streamer.start()
    stderr.emit("data", Buffer.from("[Start speaking]"))
    await startPromise

    expect(execa).toHaveBeenCalledWith(
      "whisper-stream",
      expect.arrayContaining([
        "-m", "/path/model.bin",
        "--step", "2000",
        "--length", "8000",
        "-l", "en",
        "-t", "4",
      ]),
      expect.any(Object),
    )

    expect(streamer.isActive()).toBe(true)
  })
})
