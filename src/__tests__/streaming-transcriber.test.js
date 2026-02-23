import { describe, it, expect, vi, beforeEach } from "vitest"
import { EventEmitter } from "node:events"
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

  const createMockChild = () => {
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const child = {
      stdout,
      stderr,
      pid: 123,
      kill: vi.fn(),
      catch: vi.fn(),
    }
    return child
  }

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
    const child = createMockChild()
    execa.mockReturnValue(child)

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
    child.stderr.emit("data", Buffer.from("[Start speaking]"))
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

  it("becomes active after start and inactive after stop", async () => {
    const { execa } = await import("execa")
    const child = createMockChild()
    execa.mockReturnValue(child)

    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({ model: "/m" })

    expect(streamer.isActive()).toBe(false)

    const startPromise = streamer.start()
    child.stderr.emit("data", Buffer.from("[Start speaking]"))
    await startPromise

    expect(streamer.isActive()).toBe(true)

    const transcript = await streamer.stop()

    expect(streamer.isActive()).toBe(false)
    expect(transcript.text).toBe("")
    expect(transcript.meta.provider).toBe("whisper-stream")
  })

  it("calls onPartial with cleaned transcription output", async () => {
    const { execa } = await import("execa")
    const child = createMockChild()
    execa.mockReturnValue(child)

    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({ model: "/m" })

    const partials = []
    const startPromise = streamer.start({
      onPartial: (text) => partials.push(text),
    })
    child.stderr.emit("data", Buffer.from("[Start speaking]"))
    await startPromise

    // Simulate transcription output on stdout
    child.stdout.emit("data", Buffer.from("  hello world  "))
    expect(partials).toEqual(["hello world"])

    // Simulate ANSI-escaped output
    child.stdout.emit("data", Buffer.from("\x1B[2Kmore text"))
    expect(partials).toEqual(["hello world", "more text"])
  })

  it("returns empty transcript when stopped without output", async () => {
    const { execa } = await import("execa")
    const child = createMockChild()
    execa.mockReturnValue(child)

    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({ model: "/m" })

    const startPromise = streamer.start()
    child.stderr.emit("data", Buffer.from("[Start speaking]"))
    await startPromise

    const transcript = await streamer.stop()
    expect(transcript.isEmpty).toBe(true)
  })

  it("returns accumulated text on stop", async () => {
    const { execa } = await import("execa")
    const child = createMockChild()
    execa.mockReturnValue(child)

    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({ model: "/m" })

    const startPromise = streamer.start()
    child.stderr.emit("data", Buffer.from("[Start speaking]"))
    await startPromise

    child.stdout.emit("data", Buffer.from("hello world"))
    const transcript = await streamer.stop()

    expect(transcript.text).toBe("hello world")
  })

  it("stop returns empty transcript when not active", async () => {
    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({ model: "/m" })

    const transcript = await streamer.stop()
    expect(transcript.isEmpty).toBe(true)
  })

  it("ignores [Start speaking] markers in stdout", async () => {
    const { execa } = await import("execa")
    const child = createMockChild()
    execa.mockReturnValue(child)

    const { createWhisperStreamTranscriber } = await import(
      "../adapters/whisper-stream-transcriber.js"
    )
    const streamer = createWhisperStreamTranscriber({ model: "/m" })

    const partials = []
    const startPromise = streamer.start({
      onPartial: (text) => partials.push(text),
    })
    child.stderr.emit("data", Buffer.from("[Start speaking]"))
    await startPromise

    // This should be ignored because it starts with [
    child.stdout.emit("data", Buffer.from("[Start speaking]"))
    expect(partials).toEqual([])
  })
})
