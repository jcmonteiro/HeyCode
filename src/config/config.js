import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const parseJson = (value, fallback) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const resolveConfigPath = () => {
  if (process.env.SPEECHD_CONFIG) return process.env.SPEECHD_CONFIG
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(base, "speechd", "config.json")
}

export const defaultConfig = {
  capture: {
    native: {
      bin: undefined, // auto-resolved to scripts/record
    },
    vad: {
      enabled: true,
      silenceDuration: 1.0,   // seconds of silence before auto-stop
      silenceThreshold: -40,  // dB threshold (more negative = more sensitive)
      gracePeriod: 1.0,       // seconds before VAD activates (avoid false triggers)
    },
    hotkey: {
      key: "space",
      modifiers: "cmd,shift",
      bin: undefined, // auto-resolved to scripts/hotkey
    },
  },
  provider: {
    type: "whisper.cpp",
    whisperCpp: {
      bin: "whisper-cli",
      model: path.join(os.homedir(), ".local", "share", "whisper-cpp", "models", "ggml-large-v3-turbo.bin"),
      language: "auto",
      threads: undefined,
      extraArgs: [],
    },
    openai: {
      apiKey: "",
      model: "whisper-1",
      language: "",
    },
    streaming: {
      bin: "whisper-stream",
      stepMs: 3000,
      lengthMs: 10000,
      captureDevice: undefined,
      vadThreshold: undefined,
    },
  },
}

export const loadConfig = async () => {
  const configPath = resolveConfigPath()
  let fileConfig = {}

  try {
    const raw = await fs.readFile(configPath, "utf8")
    fileConfig = JSON.parse(raw)
  } catch {
    fileConfig = {}
  }

  const envConfig = {
    capture: {
      native: {
        bin: process.env.SPEECHD_RECORDER_BIN,
      },
      vad: {
        enabled: process.env.SPEECHD_VAD_ENABLED !== undefined
          ? process.env.SPEECHD_VAD_ENABLED !== "false"
          : undefined,
        silenceDuration: process.env.SPEECHD_VAD_SILENCE_DURATION
          ? Number(process.env.SPEECHD_VAD_SILENCE_DURATION)
          : undefined,
        silenceThreshold: process.env.SPEECHD_VAD_SILENCE_THRESHOLD
          ? Number(process.env.SPEECHD_VAD_SILENCE_THRESHOLD)
          : undefined,
        gracePeriod: process.env.SPEECHD_VAD_GRACE_PERIOD
          ? Number(process.env.SPEECHD_VAD_GRACE_PERIOD)
          : undefined,
      },
      hotkey: {
        key: process.env.SPEECHD_HOTKEY_KEY,
        modifiers: process.env.SPEECHD_HOTKEY_MODIFIERS,
        bin: process.env.SPEECHD_HOTKEY_BIN,
      },
    },
    provider: {
      type: process.env.SPEECHD_PROVIDER,
      whisperCpp: {
        bin: process.env.SPEECHD_WHISPER_BIN,
        model: process.env.SPEECHD_WHISPER_MODEL,
        language: process.env.SPEECHD_WHISPER_LANG,
        threads: process.env.SPEECHD_WHISPER_THREADS
          ? Number(process.env.SPEECHD_WHISPER_THREADS)
          : undefined,
        extraArgs: parseJson(process.env.SPEECHD_WHISPER_EXTRA_ARGS, undefined),
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || process.env.SPEECHD_OPENAI_KEY,
        model: process.env.SPEECHD_OPENAI_MODEL,
        language: process.env.SPEECHD_OPENAI_LANG,
      },
      streaming: {
        bin: process.env.SPEECHD_STREAMING_BIN,
        stepMs: process.env.SPEECHD_STREAMING_STEP_MS
          ? Number(process.env.SPEECHD_STREAMING_STEP_MS)
          : undefined,
        lengthMs: process.env.SPEECHD_STREAMING_LENGTH_MS
          ? Number(process.env.SPEECHD_STREAMING_LENGTH_MS)
          : undefined,
        captureDevice: process.env.SPEECHD_STREAMING_CAPTURE_DEVICE
          ? Number(process.env.SPEECHD_STREAMING_CAPTURE_DEVICE)
          : undefined,
        vadThreshold: process.env.SPEECHD_STREAMING_VAD_THRESHOLD
          ? Number(process.env.SPEECHD_STREAMING_VAD_THRESHOLD)
          : undefined,
      },
    },
  }

  return mergeConfig(defaultConfig, fileConfig, envConfig)
}

const mergeConfig = (base, ...overrides) => {
  const output = structuredClone(base)
  for (const override of overrides) {
    if (!override || typeof override !== "object") continue
    for (const [key, value] of Object.entries(override)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        output[key] = mergeConfig(output[key] ?? {}, value)
      } else if (value !== undefined && value !== null) {
        output[key] = value
      }
    }
  }
  return output
}

export const resolveConfigFilePath = () => resolveConfigPath()
