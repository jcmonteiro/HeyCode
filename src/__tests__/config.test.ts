import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"

describe("config", () => {
  let loadConfig: typeof import("../config/config.js").loadConfig
  let defaultConfig: typeof import("../config/config.js").defaultConfig

  beforeEach(async () => {
    vi.restoreAllMocks()

    // Clear env vars that could affect config
    delete process.env.SPEECHD_CONFIG
    delete process.env.SPEECHD_PROVIDER
    delete process.env.SPEECHD_WHISPER_BIN
    delete process.env.SPEECHD_WHISPER_MODEL
    delete process.env.SPEECHD_VAD_ENABLED
    delete process.env.SPEECHD_RECORDER_BIN

    // Re-import to get fresh module
    const mod = await import("../config/config.js")
    loadConfig = mod.loadConfig
    defaultConfig = mod.defaultConfig
  })

  afterEach(() => {
    delete process.env.SPEECHD_CONFIG
    delete process.env.SPEECHD_PROVIDER
    delete process.env.SPEECHD_WHISPER_BIN
    delete process.env.SPEECHD_WHISPER_MODEL
    delete process.env.SPEECHD_VAD_ENABLED
    delete process.env.SPEECHD_RECORDER_BIN
  })

  it("returns default config when no file or env vars exist", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))

    const config = await loadConfig()

    expect(config.provider.type).toBe("whisper.cpp")
    expect(config.capture.vad.enabled).toBe(true)
    expect(config.capture.vad.silenceDuration).toBe(1.0)
  })

  it("merges file config over defaults", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({
      provider: { type: "openai" },
    }))

    const config = await loadConfig()

    expect(config.provider.type).toBe("openai")
    // Other defaults should still be present
    expect(config.capture.vad.enabled).toBe(true)
  })

  it("merges env vars over file config", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({
      provider: { type: "openai" },
    }))

    process.env.SPEECHD_PROVIDER = "whisper.cpp"

    const config = await loadConfig()

    expect(config.provider.type).toBe("whisper.cpp")
  })

  it("parses VAD_ENABLED env var correctly", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))

    process.env.SPEECHD_VAD_ENABLED = "false"
    const config = await loadConfig()
    expect(config.capture.vad.enabled).toBe(false)
  })

  it("does not have server or afrecord config", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"))

    const config = await loadConfig()

    expect((config as any).server).toBeUndefined()
    expect((config.capture as any).afrecord).toBeUndefined()
    expect((config.capture as any).tool).toBeUndefined()
  })

  it("default model is ggml-large-v3-turbo.bin", () => {
    expect(defaultConfig.provider.whisperCpp.model).toContain("ggml-large-v3-turbo.bin")
  })

  it("does not clobber nested defaults with partial overrides", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({
      capture: { vad: { silenceDuration: 5.0 } },
    }))

    const config = await loadConfig()

    expect(config.capture.vad.silenceDuration).toBe(5.0)
    expect(config.capture.vad.enabled).toBe(true) // default preserved
    expect(config.capture.vad.silenceThreshold).toBe(-40) // default preserved
  })

  it("ignores null and undefined values in overrides", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({
      provider: { type: null },
    }))

    const config = await loadConfig()

    // Should not be overridden by null
    expect(config.provider.type).toBe("whisper.cpp")
  })
})
