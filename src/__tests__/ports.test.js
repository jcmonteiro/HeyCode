import { describe, it, expect } from "vitest"
import { assertRecorderPort } from "../ports/recorder.js"
import { assertTranscriberPort } from "../ports/transcriber.js"

describe("assertRecorderPort", () => {
  it("accepts valid port", () => {
    const port = { start: () => {}, stop: () => {}, status: () => {} }
    expect(() => assertRecorderPort(port)).not.toThrow()
  })

  it("rejects missing start", () => {
    expect(() => assertRecorderPort({ stop: () => {}, status: () => {} })).toThrow(
      /start/,
    )
  })

  it("rejects null", () => {
    expect(() => assertRecorderPort(null)).toThrow(TypeError)
  })
})

describe("assertTranscriberPort", () => {
  it("accepts valid port", () => {
    expect(() => assertTranscriberPort({ transcribe: () => {} })).not.toThrow()
  })

  it("rejects missing transcribe", () => {
    expect(() => assertTranscriberPort({})).toThrow(/transcribe/)
  })
})
