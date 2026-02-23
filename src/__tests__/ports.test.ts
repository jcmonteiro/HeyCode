import { describe, it, expect } from "vitest"
import { assertRecorderPort, supportsWaitForStop } from "../ports/recorder.js"
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

describe("supportsWaitForStop", () => {
  it("returns true when waitForStop is a function", () => {
    const port = { start: () => {}, stop: () => {}, status: () => {}, waitForStop: () => {} }
    expect(supportsWaitForStop(port as any)).toBe(true)
  })

  it("returns false when waitForStop is missing", () => {
    const port = { start: () => {}, stop: () => {}, status: () => {} }
    expect(supportsWaitForStop(port as any)).toBe(false)
  })

  it("returns false for null", () => {
    expect(supportsWaitForStop(null)).toBe(false)
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
