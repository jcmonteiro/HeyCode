import { describe, it, expect, vi, beforeEach } from "vitest"
import { EventEmitter } from "node:events"
import fs from "node:fs/promises"
import { RecordingAlreadyActiveError, NoActiveRecordingError } from "../domain/errors.js"

// Mock execa before importing the adapter
vi.mock("execa", () => ({
  execa: vi.fn(),
}))

const { createNativeRecorder } = await import("../adapters/native-recorder.js")
const { execa } = await import("execa")

describe("createNativeRecorder", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  const mockChild = (readyLine = "recording:/tmp/test.wav") => {
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const child = {
      stdout,
      stderr,
      pid: 12345,
      unref: vi.fn(),
      catch: vi.fn(),
      kill: vi.fn(),
    }

    // Simulate emitting the ready line shortly after creation
    if (readyLine) {
      setTimeout(() => stdout.emit("data", Buffer.from(readyLine)), 10)
    }

    return child
  }

  it("creates an object with start, stop, and status methods", () => {
    const recorder = createNativeRecorder({ binPath: "/path/to/record" })
    expect(typeof recorder.start).toBe("function")
    expect(typeof recorder.stop).toBe("function")
    expect(typeof recorder.status).toBe("function")
  })

  it("does not expose waitForStop when VAD is disabled", () => {
    const recorder = createNativeRecorder({ binPath: "/path/to/record" })
    expect(recorder.waitForStop).toBeUndefined()
  })

  it("exposes waitForStop when VAD is enabled", () => {
    const recorder = createNativeRecorder({
      binPath: "/path/to/record",
      vad: { enabled: true },
    })
    expect(typeof recorder.waitForStop).toBe("function")
  })

  it("returns null status when no state file exists", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))

    const recorder = createNativeRecorder({ binPath: "/path/to/record" })
    const status = await recorder.status()
    expect(status).toBeNull()
  })

  it("returns Recording object when state exists and process is alive", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(
      JSON.stringify({ pid: process.pid, outputPath: "/tmp/test.wav" }),
    )

    const recorder = createNativeRecorder({ binPath: "/path/to/record" })
    const status = await recorder.status()
    expect(status).not.toBeNull()
    expect(status.pid).toBe(process.pid)
    expect(status.outputPath).toBe("/tmp/test.wav")
  })

  it("clears stale state and returns null when process is dead", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(
      JSON.stringify({ pid: 999999, outputPath: "/tmp/old.wav" }),
    )
    const unlinkSpy = vi.spyOn(fs, "unlink").mockResolvedValue(undefined)

    const recorder = createNativeRecorder({ binPath: "/path/to/record" })
    const status = await recorder.status()
    expect(status).toBeNull()
    expect(unlinkSpy).toHaveBeenCalled()
  })

  it("starts recording and writes state file", async () => {
    // No existing state
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/speechd-audio-abc")
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined)
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined)

    const child = mockChild("recording:/tmp/speechd-audio-abc/test.wav")
    execa.mockReturnValue(child)

    const recorder = createNativeRecorder({ binPath: "/bin/record" })
    const outputPath = await recorder.start()

    expect(execa).toHaveBeenCalledWith(
      "/bin/record",
      expect.arrayContaining([expect.stringContaining("/tmp/speechd-audio-abc/")]),
      expect.objectContaining({ detached: true }),
    )
    expect(outputPath).toContain("/tmp/speechd-audio-abc/")
  })

  it("passes VAD flags when VAD is enabled", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/speechd-audio-abc")
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined)
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined)

    const child = mockChild("recording:/tmp/speechd-audio-abc/test.wav")
    execa.mockReturnValue(child)

    const recorder = createNativeRecorder({
      binPath: "/bin/record",
      vad: { enabled: true, silenceDuration: 3.0, silenceThreshold: -35, gracePeriod: 2.0 },
    })
    await recorder.start()

    // execa is called with (binPath, argsArray, options)
    const callArgs = execa.mock.calls[0]
    const binArgs = callArgs[1]
    expect(binArgs).toContain("--vad")
    expect(binArgs).toContain("--silence-duration")
    expect(binArgs).toContain("3")
    expect(binArgs).toContain("--silence-threshold")
    expect(binArgs).toContain("-35")
    expect(binArgs).toContain("--vad-grace")
    expect(binArgs).toContain("2")
  })

  it("does not pass VAD flags when VAD is disabled", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/speechd-audio-abc")
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined)
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined)

    const child = mockChild("recording:/tmp/speechd-audio-abc/test.wav")
    execa.mockReturnValue(child)

    const recorder = createNativeRecorder({
      binPath: "/bin/record",
      vad: { enabled: false },
    })
    await recorder.start()

    const args = execa.mock.calls[0][1]
    expect(args).not.toContain("--vad")
  })

  it("throws RecordingAlreadyActiveError if already recording", async () => {
    // State file shows an active recording with our own pid (guaranteed alive)
    vi.spyOn(fs, "readFile").mockResolvedValue(
      JSON.stringify({ pid: process.pid, outputPath: "/tmp/test.wav" }),
    )

    const recorder = createNativeRecorder({ binPath: "/bin/record" })
    await expect(recorder.start()).rejects.toThrow(RecordingAlreadyActiveError)
  })

  it("stops recording by sending SIGINT and clears state", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(
      JSON.stringify({ pid: 99999, outputPath: "/tmp/test.wav" }),
    )
    const unlinkSpy = vi.spyOn(fs, "unlink").mockResolvedValue(undefined)
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {})

    const recorder = createNativeRecorder({ binPath: "/bin/record" })
    const outputPath = await recorder.stop()

    expect(killSpy).toHaveBeenCalledWith(99999, "SIGINT")
    expect(outputPath).toBe("/tmp/test.wav")
    expect(unlinkSpy).toHaveBeenCalled()
  })

  it("throws NoActiveRecordingError when stopping with no state", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))

    const recorder = createNativeRecorder({ binPath: "/bin/record" })
    await expect(recorder.stop()).rejects.toThrow(NoActiveRecordingError)
  })
})
