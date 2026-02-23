/**
 * Factory: create a RecorderPort from config.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createNativeRecorder } from "../adapters/native-recorder.js"
import type { RecorderPort } from "../ports/recorder.js"
import type { HeycodeConfig } from "../config/config.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Default path to the compiled Swift recorder binary. */
const defaultBinPath = (): string => path.resolve(__dirname, "../../scripts/record")

export function createRecorder(config: HeycodeConfig): RecorderPort {
  const binPath = config.capture?.native?.bin || defaultBinPath()
  const vad = config.capture?.vad
  return createNativeRecorder({ binPath, vad })
}
