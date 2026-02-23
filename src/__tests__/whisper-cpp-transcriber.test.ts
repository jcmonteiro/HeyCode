import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs/promises"
import { TranscriberConfigError, TranscriptionFailedError } from "../domain/errors.js"

// Mock execa before importing the adapter
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}))

const { createWhisperCppTranscriber } = await import("../adapters/whisper-cpp-transcriber.js")
const { execa } = await import("execa") as any

describe("createWhisperCppTranscriber", () => {
  it("throws TranscriberConfigError if bin is missing", () => {
    expect(() => createWhisperCppTranscriber({ bin: "", model: "/m" })).toThrow(
      TranscriberConfigError,
    )
  })

  it("throws TranscriberConfigError if model is missing", () => {
    expect(() => createWhisperCppTranscriber({ bin: "whisper-cli", model: "" })).toThrow(
      TranscriberConfigError,
    )
  })

  it("creates a valid TranscriberPort", () => {
    const t = createWhisperCppTranscriber({ bin: "whisper-cli", model: "/m" })
    expect(typeof t.transcribe).toBe("function")
  })
})

describe("whisper-cpp transcribe", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("calls whisper-cli with correct base args", async () => {
    const { execa: execaMock } = await import("execa") as any
    execaMock.mockResolvedValue({ stdout: "", stderr: "" })

    // Mock fs.access to succeed and fs.readFile to return transcript text
    vi.spyOn(fs, "access").mockResolvedValue(undefined)
    vi.spyOn(fs, "readFile").mockResolvedValue("  hello   world  \n")
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/heycode-mock")

    const t = createWhisperCppTranscriber({ bin: "whisper-cli", model: "/models/tiny.bin" })
    const result = await t.transcribe("/tmp/audio.wav")

    expect(execaMock).toHaveBeenCalledWith(
      "whisper-cli",
      expect.arrayContaining(["-m", "/models/tiny.bin", "-f", "/tmp/audio.wav"]),
      expect.any(Object),
    )

    // Text should be normalized
    expect(result.text).toBe("hello world")
    expect(result.meta.provider).toBe("whisper.cpp")
  })

  it("includes language flag when not 'auto'", async () => {
    const { execa: execaMock } = await import("execa") as any
    execaMock.mockResolvedValue({ stdout: "", stderr: "" })
    vi.spyOn(fs, "access").mockResolvedValue(undefined)
    vi.spyOn(fs, "readFile").mockResolvedValue("text")
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/heycode-mock")

    const t = createWhisperCppTranscriber({
      bin: "whisper-cli",
      model: "/m",
      language: "en",
    })
    await t.transcribe("/tmp/audio.wav")

    expect(execaMock).toHaveBeenCalledWith(
      "whisper-cli",
      expect.arrayContaining(["-l", "en"]),
      expect.any(Object),
    )
  })

  it("omits language flag for 'auto'", async () => {
    const { execa: execaMock } = await import("execa") as any
    execaMock.mockResolvedValue({ stdout: "", stderr: "" })
    vi.spyOn(fs, "access").mockResolvedValue(undefined)
    vi.spyOn(fs, "readFile").mockResolvedValue("text")
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/heycode-mock")

    const t = createWhisperCppTranscriber({
      bin: "whisper-cli",
      model: "/m",
      language: "auto",
    })
    await t.transcribe("/tmp/audio.wav")

    const callArgs = execaMock.mock.calls[0][1] as string[]
    expect(callArgs).not.toContain("-l")
  })

  it("includes thread count when specified", async () => {
    const { execa: execaMock } = await import("execa") as any
    execaMock.mockResolvedValue({ stdout: "", stderr: "" })
    vi.spyOn(fs, "access").mockResolvedValue(undefined)
    vi.spyOn(fs, "readFile").mockResolvedValue("text")
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/heycode-mock")

    const t = createWhisperCppTranscriber({
      bin: "whisper-cli",
      model: "/m",
      threads: 4,
    })
    await t.transcribe("/tmp/audio.wav")

    expect(execaMock).toHaveBeenCalledWith(
      "whisper-cli",
      expect.arrayContaining(["-t", "4"]),
      expect.any(Object),
    )
  })

  it("wraps execa failure in TranscriptionFailedError", async () => {
    const { execa: execaMock } = await import("execa") as any
    execaMock.mockRejectedValue(new Error("signal 11"))
    vi.spyOn(fs, "access").mockResolvedValue(undefined)
    vi.spyOn(fs, "mkdtemp").mockResolvedValue("/tmp/heycode-mock")

    const t = createWhisperCppTranscriber({ bin: "whisper-cli", model: "/m" })
    await expect(t.transcribe("/tmp/audio.wav")).rejects.toThrow(TranscriptionFailedError)
  })
})
