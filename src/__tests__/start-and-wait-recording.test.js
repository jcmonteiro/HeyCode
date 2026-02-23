import { describe, it, expect, vi, beforeEach } from "vitest"
import { startAndWaitRecording } from "../usecases/start-and-wait-recording.js"
import { RecordingAlreadyActiveError } from "../domain/errors.js"
import { Recording } from "../domain/recording.js"

/**
 * Creates a mock RecorderPort with waitForStop support.
 */
const createMockRecorder = (overrides = {}) => ({
  start: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  stop: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  status: vi.fn().mockResolvedValue(null),
  waitForStop: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  ...overrides,
})

const createMockTranscriber = (overrides = {}) => ({
  transcribe: vi.fn().mockResolvedValue({
    text: "hello world",
    isEmpty: false,
    meta: { provider: "mock" },
  }),
  ...overrides,
})

describe("startAndWaitRecording", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("starts recording and waits for auto-stop", async () => {
    const recorder = createMockRecorder()
    const transcriber = createMockTranscriber()

    const result = await startAndWaitRecording({ recorder, transcriber })

    expect(recorder.start).toHaveBeenCalled()
    expect(recorder.waitForStop).toHaveBeenCalled()
    expect(transcriber.transcribe).toHaveBeenCalledWith("/tmp/audio.wav")
    expect(result.transcript.text).toBe("hello world")
  })

  it("throws if already recording", async () => {
    const active = new Recording({ pid: 42, outputPath: "/tmp/x.wav" })
    const recorder = createMockRecorder({
      status: vi.fn().mockResolvedValue(active),
    })
    const transcriber = createMockTranscriber()

    await expect(startAndWaitRecording({ recorder, transcriber }))
      .rejects.toThrow(RecordingAlreadyActiveError)
  })

  it("returns empty transcript when no speech detected", async () => {
    const recorder = createMockRecorder()
    const transcriber = createMockTranscriber({
      transcribe: vi.fn().mockResolvedValue({
        text: "",
        isEmpty: true,
        meta: { provider: "mock" },
      }),
    })

    const result = await startAndWaitRecording({ recorder, transcriber })

    expect(result.transcript.isEmpty).toBe(true)
  })

  it("calls onStarted callback when recording begins", async () => {
    const recorder = createMockRecorder()
    const transcriber = createMockTranscriber()
    const onStarted = vi.fn()

    await startAndWaitRecording({ recorder, transcriber, onStarted })

    expect(onStarted).toHaveBeenCalled()
  })

  it("calls onStopped callback when recording auto-stops", async () => {
    const recorder = createMockRecorder()
    const transcriber = createMockTranscriber()
    const onStopped = vi.fn()

    await startAndWaitRecording({ recorder, transcriber, onStopped })

    expect(onStopped).toHaveBeenCalledWith("/tmp/audio.wav")
  })

  it("propagates recorder errors", async () => {
    const recorder = createMockRecorder({
      start: vi.fn().mockRejectedValue(new Error("mic denied")),
    })
    const transcriber = createMockTranscriber()

    await expect(startAndWaitRecording({ recorder, transcriber }))
      .rejects.toThrow("mic denied")
  })

  it("propagates transcription errors", async () => {
    const recorder = createMockRecorder()
    const transcriber = createMockTranscriber({
      transcribe: vi.fn().mockRejectedValue(new Error("model not found")),
    })

    await expect(startAndWaitRecording({ recorder, transcriber }))
      .rejects.toThrow("model not found")
  })
})
