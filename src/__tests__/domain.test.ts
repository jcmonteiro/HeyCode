import { describe, it, expect } from "vitest"
import { Transcript } from "../domain/transcript.js"
import { Recording } from "../domain/recording.js"
import {
  SpeechError,
  RecordingAlreadyActiveError,
  NoActiveRecordingError,
  RecorderStartTimeoutError,
  TranscriberConfigError,
  TranscriptionFailedError,
} from "../domain/errors.js"

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

describe("Transcript", () => {
  it("stores text and meta", () => {
    const t = new Transcript({ text: "hello world", meta: { provider: "test" } })
    expect(t.text).toBe("hello world")
    expect(t.meta.provider).toBe("test")
  })

  it("defaults meta to empty object", () => {
    const t = new Transcript({ text: "hi" })
    expect(t.meta).toEqual({})
  })

  it("is immutable", () => {
    const t = new Transcript({ text: "hi", meta: { provider: "x" } })
    expect(() => { (t as any).text = "changed" }).toThrow()
    expect(() => { (t.meta as any).provider = "changed" }).toThrow()
  })

  it("reports isEmpty for blank transcriptions", () => {
    expect(new Transcript({ text: "" }).isEmpty).toBe(true)
    expect(new Transcript({ text: "   " }).isEmpty).toBe(true)
    expect(new Transcript({ text: "word" }).isEmpty).toBe(false)
  })

  it("rejects non-string text", () => {
    expect(() => new Transcript({ text: 42 as any })).toThrow(TypeError)
    expect(() => new Transcript({ text: null as any })).toThrow(TypeError)
  })
})

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

describe("Recording", () => {
  it("stores pid and outputPath", () => {
    const r = new Recording({ pid: 1234, outputPath: "/tmp/audio.wav" })
    expect(r.pid).toBe(1234)
    expect(r.outputPath).toBe("/tmp/audio.wav")
  })

  it("is immutable", () => {
    const r = new Recording({ pid: 1, outputPath: "/tmp/a.wav" })
    expect(() => { (r as any).pid = 999 }).toThrow()
  })

  it("rejects invalid pid", () => {
    expect(() => new Recording({ pid: -1, outputPath: "/tmp/a.wav" })).toThrow(TypeError)
    expect(() => new Recording({ pid: 0, outputPath: "/tmp/a.wav" })).toThrow(TypeError)
    expect(() => new Recording({ pid: NaN, outputPath: "/tmp/a.wav" })).toThrow(TypeError)
  })

  it("rejects empty outputPath", () => {
    expect(() => new Recording({ pid: 1, outputPath: "" })).toThrow(TypeError)
    expect(() => new Recording({ pid: 1, outputPath: 42 as any })).toThrow(TypeError)
  })
})

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

describe("Domain errors", () => {
  it("SpeechError is an Error", () => {
    const e = new SpeechError("boom")
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe("SpeechError")
  })

  it("RecordingAlreadyActiveError has fixed message", () => {
    const e = new RecordingAlreadyActiveError()
    expect(e).toBeInstanceOf(SpeechError)
    expect(e.message).toBe("Recording already in progress")
  })

  it("NoActiveRecordingError has fixed message", () => {
    const e = new NoActiveRecordingError()
    expect(e).toBeInstanceOf(SpeechError)
    expect(e.message).toBe("No recording in progress")
  })

  it("RecorderStartTimeoutError includes duration", () => {
    const e = new RecorderStartTimeoutError(5000)
    expect(e.message).toContain("5000")
  })

  it("TranscriberConfigError includes detail", () => {
    const e = new TranscriberConfigError("missing model")
    expect(e.message).toContain("missing model")
  })

  it("TranscriptionFailedError includes provider and detail", () => {
    const e = new TranscriptionFailedError("whisper.cpp", "signal 11")
    expect(e.message).toContain("whisper.cpp")
    expect(e.message).toContain("signal 11")
  })
})
