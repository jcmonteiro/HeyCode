import { describe, it, expect, vi, beforeEach } from "vitest"
import { recordAndTranscribe } from "../usecases/record-and-transcribe.js"
import { Recording } from "../domain/recording.js"
import { Transcript } from "../domain/transcript.js"
import type { RecorderPort } from "../ports/recorder.js"
import type { TranscriberPort } from "../ports/transcriber.js"

const createMockRecorder = (overrides: Partial<RecorderPort> = {}): RecorderPort => ({
  start: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  stop: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  status: vi.fn().mockResolvedValue(null),
  ...overrides,
})

const createMockTranscriber = (text = "hello world"): TranscriberPort => ({
  transcribe: vi.fn().mockResolvedValue(
    new Transcript({ text, meta: { provider: "mock" } }),
  ),
})

describe("recordAndTranscribe", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // --- Toggle mode (no VAD) ---

  it("starts recording when idle in toggle mode", async () => {
    const recorder = createMockRecorder()
    const transcriber = createMockTranscriber()

    const result = await recordAndTranscribe({ recorder, transcriber })

    expect(recorder.start).toHaveBeenCalled()
    expect(result).toEqual({ action: "started" })
  })

  it("stops and transcribes when active in toggle mode", async () => {
    const active = new Recording({ pid: 42, outputPath: "/tmp/speech.wav" })
    const recorder = createMockRecorder({
      status: vi.fn().mockResolvedValue(active),
      stop: vi.fn().mockResolvedValue("/tmp/speech.wav"),
    })
    const transcriber = createMockTranscriber("the quick brown fox")

    const result = await recordAndTranscribe({ recorder, transcriber })

    expect(recorder.stop).toHaveBeenCalled()
    expect(transcriber.transcribe).toHaveBeenCalledWith("/tmp/speech.wav")
    expect(result.action).toBe("stopped")
    if (result.action === "stopped") {
      expect(result.transcript.text).toBe("the quick brown fox")
    }
  })

  it("returns empty transcript for silence in toggle mode", async () => {
    const active = new Recording({ pid: 42, outputPath: "/tmp/silence.wav" })
    const recorder = createMockRecorder({
      status: vi.fn().mockResolvedValue(active),
      stop: vi.fn().mockResolvedValue("/tmp/silence.wav"),
    })
    const transcriber = createMockTranscriber("")

    const result = await recordAndTranscribe({ recorder, transcriber })

    expect(result.action).toBe("stopped")
    if (result.action === "stopped") {
      expect(result.transcript.isEmpty).toBe(true)
    }
  })

  // --- VAD mode ---

  it("records and auto-stops with VAD when idle and waitForStop available", async () => {
    const recorder = createMockRecorder({
      waitForStop: vi.fn().mockResolvedValue("/tmp/vad.wav"),
    })
    const transcriber = createMockTranscriber("hello from VAD")

    const result = await recordAndTranscribe({
      recorder,
      transcriber,
      vadEnabled: true,
    })

    expect(recorder.start).toHaveBeenCalled()
    expect(recorder.waitForStop).toHaveBeenCalled()
    expect(transcriber.transcribe).toHaveBeenCalledWith("/tmp/vad.wav")
    expect(result.action).toBe("stopped")
    if (result.action === "stopped") {
      expect(result.transcript.text).toBe("hello from VAD")
    }
  })

  it("falls back to toggle mode when VAD enabled but recorder lacks waitForStop", async () => {
    const recorder = createMockRecorder() // no waitForStop
    const transcriber = createMockTranscriber()

    const result = await recordAndTranscribe({
      recorder,
      transcriber,
      vadEnabled: true,
    })

    // Should fall back to toggle: start recording
    expect(recorder.start).toHaveBeenCalled()
    expect(result).toEqual({ action: "started" })
  })

  it("force-stops active recording in VAD mode", async () => {
    const active = new Recording({ pid: 42, outputPath: "/tmp/x.wav" })
    const recorder = createMockRecorder({
      status: vi.fn().mockResolvedValue(active),
      stop: vi.fn().mockResolvedValue("/tmp/x.wav"),
      waitForStop: vi.fn(),
    })
    const transcriber = createMockTranscriber()

    const result = await recordAndTranscribe({
      recorder,
      transcriber,
      vadEnabled: true,
    })

    expect(recorder.stop).toHaveBeenCalled()
    expect(result).toEqual({ action: "cancelled" })
  })

  // --- Callbacks ---

  it("calls onStarted when recording begins in toggle mode", async () => {
    const recorder = createMockRecorder()
    const transcriber = createMockTranscriber()
    const onStarted = vi.fn()

    await recordAndTranscribe({ recorder, transcriber, onStarted })

    expect(onStarted).toHaveBeenCalled()
  })

  it("calls onStopped when recording stops in toggle mode", async () => {
    const active = new Recording({ pid: 42, outputPath: "/tmp/x.wav" })
    const recorder = createMockRecorder({
      status: vi.fn().mockResolvedValue(active),
      stop: vi.fn().mockResolvedValue("/tmp/x.wav"),
    })
    const transcriber = createMockTranscriber()
    const onStopped = vi.fn()

    await recordAndTranscribe({ recorder, transcriber, onStopped })

    expect(onStopped).toHaveBeenCalledWith("/tmp/x.wav")
  })

  it("calls onStarted and onStopped in VAD flow", async () => {
    const recorder = createMockRecorder({
      waitForStop: vi.fn().mockResolvedValue("/tmp/vad.wav"),
    })
    const transcriber = createMockTranscriber()
    const onStarted = vi.fn()
    const onStopped = vi.fn()

    await recordAndTranscribe({
      recorder,
      transcriber,
      vadEnabled: true,
      onStarted,
      onStopped,
    })

    expect(onStarted).toHaveBeenCalled()
    expect(onStopped).toHaveBeenCalledWith("/tmp/vad.wav")
  })

  // --- Error propagation ---

  it("propagates recorder errors", async () => {
    const recorder = createMockRecorder({
      start: vi.fn().mockRejectedValue(new Error("mic denied")),
    })
    const transcriber = createMockTranscriber()

    await expect(recordAndTranscribe({ recorder, transcriber }))
      .rejects.toThrow("mic denied")
  })

  it("propagates transcription errors", async () => {
    const active = new Recording({ pid: 42, outputPath: "/tmp/x.wav" })
    const recorder = createMockRecorder({
      status: vi.fn().mockResolvedValue(active),
      stop: vi.fn().mockResolvedValue("/tmp/x.wav"),
    })
    const transcriber: TranscriberPort = {
      transcribe: vi.fn().mockRejectedValue(new Error("model not found")),
    }

    await expect(recordAndTranscribe({ recorder, transcriber }))
      .rejects.toThrow("model not found")
  })
})
