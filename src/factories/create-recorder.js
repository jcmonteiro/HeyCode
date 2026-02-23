/**
 * Factory: create a RecorderPort from config.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createNativeRecorder } from "../adapters/native-recorder.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Default path to the compiled Swift recorder binary. */
const defaultBinPath = () => path.resolve(__dirname, "../../scripts/record")

/**
 * @param {object} config - Full application config.
 * @returns {import('../ports/recorder.js').RecorderPort}
 */
export function createRecorder(config) {
  const binPath = config.capture?.native?.bin || defaultBinPath()
  return createNativeRecorder({ binPath })
}
