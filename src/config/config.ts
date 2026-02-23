import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

export interface SpeechdConfig {
  capture: {
    native: {
      bin?: string
    }
    vad: {
      enabled: boolean
      silenceDuration: number
      silenceThreshold: number
      gracePeriod: number
    }
    hotkey: {
      key: string
      modifiers: string
      bin?: string
    }
  }
  provider: {
    type: string
    whisperCpp: {
      bin: string
      model: string
      language: string
      threads?: number
      extraArgs: string[]
    }
    openai: {
      apiKey: string
      model: string
      language: string
    }
    streaming: {
      bin: string
      stepMs: number
      lengthMs: number
      captureDevice?: number
      vadThreshold?: number
    }
  }
}

const parseJson = <T>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const resolveConfigPath = (): string => {
  if (process.env.SPEECHD_CONFIG) return process.env.SPEECHD_CONFIG
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(base, "speechd", "config.json")
}

export const defaultConfig: SpeechdConfig = {
  capture: {
    native: {
      bin: undefined,
    },
    vad: {
      enabled: true,
      silenceDuration: 1.0,
      silenceThreshold: -40,
      gracePeriod: 1.0,
    },
    hotkey: {
      key: "space",
      modifiers: "cmd,shift",
      bin: undefined,
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

export const loadConfig = async (): Promise<SpeechdConfig> => {
  const configPath = resolveConfigPath()
  let fileConfig: Record<string, unknown> = {}

  try {
    const raw = await fs.readFile(configPath, "utf8")
    fileConfig = JSON.parse(raw) as Record<string, unknown>
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
        extraArgs: parseJson<string[] | undefined>(process.env.SPEECHD_WHISPER_EXTRA_ARGS, undefined),
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

  return mergeConfig(defaultConfig, fileConfig, envConfig) as SpeechdConfig
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mergeConfig = (base: any, ...overrides: any[]): any => {
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

export const resolveConfigFilePath = (): string => resolveConfigPath()
