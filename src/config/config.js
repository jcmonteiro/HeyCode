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
  server: {
    host: "127.0.0.1",
    port: 7331,
  },
  capture: {
    tool: "native",
    native: {
      bin: undefined, // auto-resolved to scripts/record
      device: undefined,
    },
    // Legacy afrecord config kept for reference
    afrecord: {
      bin: "afrecord",
      format: "cd",
      type: "wav",
      device: undefined,
    },
  },
  provider: {
    type: "whisper.cpp",
    whisperCpp: {
      bin: "whisper-cli",
      model: path.join(os.homedir(), ".local", "share", "whisper-cpp", "models", "ggml-tiny.en.bin"),
      language: "auto",
      threads: undefined,
      extraArgs: [],
    },
    openai: {
      apiKey: "",
      model: "whisper-1",
      language: "",
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
    server: {
      host: process.env.SPEECHD_SERVER_HOST,
      port: process.env.SPEECHD_SERVER_PORT
        ? Number(process.env.SPEECHD_SERVER_PORT)
        : undefined,
    },
    capture: {
      tool: process.env.SPEECHD_CAPTURE_TOOL,
      afrecord: {
        bin: process.env.SPEECHD_AFRECORD_BIN,
        format: process.env.SPEECHD_AFRECORD_FORMAT,
        type: process.env.SPEECHD_AFRECORD_TYPE,
        device: process.env.SPEECHD_AFRECORD_DEVICE,
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
