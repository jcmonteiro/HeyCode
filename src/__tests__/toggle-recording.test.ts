import { describe, it, expect, vi } from "vitest"
import { toggleRecording } from "../usecases/toggle-recording.js"
import { Recording } from "../domain/recording.js"
import type { RecorderPort } from "../ports/recorder.js"

/**
 * Creates a mock RecorderPort with sensible defaults.
 * Each method is a vitest mock that can be individually overridden.
 */
const createMockRecorder = (overrides: Partial<RecorderPort> = {}): RecorderPort => ({
  start: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  stop: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  status: vi.fn().mockResolvedValue(null),
  ...overrides,
})

describe("toggleRecording", () => {
  it("starts recording when idle", async () => {
    const recorder = createMockRecorder()

    const result = await toggleRecording({ recorder })

    expect(recorder.status).toHaveBeenCalled()
    expect(recorder.start).toHaveBeenCalled()
    expect(recorder.stop).not.toHaveBeenCalled()
    expect(result).toEqual({ action: "started" })
  })

  it("stops recording and returns output path when active", async () => {
    const active = new Recording({ pid: 42, outputPath: "/tmp/speech.wav" })
    const recorder = createMockRecorder({
      status: vi.fn().mockResolvedValue(active),
      stop: vi.fn().mockResolvedValue("/tmp/speech.wav"),
    })

    const result = await toggleRecording({ recorder })

    expect(recorder.status).toHaveBeenCalled()
    expect(recorder.stop).toHaveBeenCalled()
    expect(recorder.start).not.toHaveBeenCalled()
    expect(result).toEqual({ action: "stopped", outputPath: "/tmp/speech.wav" })
  })

  it("propagates recorder errors", async () => {
    const recorder = createMockRecorder({
      start: vi.fn().mockRejectedValue(new Error("mic denied")),
    })

    await expect(toggleRecording({ recorder })).rejects.toThrow("mic denied")
  })
})
