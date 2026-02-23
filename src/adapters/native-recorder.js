/**
 * Native macOS recorder adapter.
 *
 * Implements RecorderPort using the compiled Swift AVFoundation binary
 * (scripts/record). Records 16kHz mono 16-bit PCM WAV files suitable
 * for whisper-cli.
 *
 * Recording state is persisted to a JSON file in the cache directory
 * so that start and stop can happen in separate process invocations
 * (the recorder runs as a detached child process).
 */
import { execa } from "execa"
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"
import { Recording } from "../domain/recording.js"
import {
  RecordingAlreadyActiveError,
  NoActiveRecordingError,
  RecorderStartTimeoutError,
} from "../domain/errors.js"

const START_TIMEOUT_MS = 5_000
const STOP_FLUSH_MS = 500

// ---------------------------------------------------------------------------
// State persistence (pid + outputPath in a JSON file)
// ---------------------------------------------------------------------------

/** @param {{ cacheDir?: string }} [opts] */
const statePath = (opts) => {
  const base = opts?.cacheDir ?? process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache")
  return path.join(base, "speechd", "recording.json")
}

const readState = async (opts) => {
  try {
    const raw = await fs.readFile(statePath(opts), "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const writeState = async (state, opts) => {
  const fp = statePath(opts)
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await fs.writeFile(fp, JSON.stringify(state, null, 2))
}

const clearState = async (opts) => {
  try {
    await fs.unlink(statePath(opts))
  } catch {
    // already gone
  }
}

/** Check whether a process is still alive. */
const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a NativeRecorder that satisfies RecorderPort.
 *
 * @param {{ binPath: string, cacheDir?: string }} opts
 * @returns {import('../ports/recorder.js').RecorderPort}
 */
export function createNativeRecorder({ binPath, cacheDir }) {
  const stateOpts = { cacheDir }

  return {
    async start() {
      const existing = await readState(stateOpts)
      if (existing?.pid && isAlive(existing.pid)) {
        throw new RecordingAlreadyActiveError()
      }

      // Clean stale state from a dead process
      if (existing) await clearState(stateOpts)

      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "speechd-audio-"))
      const outputPath = path.join(dir, `recording-${Date.now()}.wav`)

      const child = execa(binPath, [outputPath], {
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
      })

      // Wait for the "recording:<path>" confirmation line on stdout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new RecorderStartTimeoutError(START_TIMEOUT_MS))
        }, START_TIMEOUT_MS)

        child.stdout.on("data", (data) => {
          if (data.toString().trim().startsWith("recording:")) {
            clearTimeout(timeout)
            resolve()
          }
        })

        child.catch((err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })

      child.unref?.()
      await writeState({ pid: child.pid, outputPath }, stateOpts)
      return outputPath
    },

    async stop() {
      const existing = await readState(stateOpts)
      if (!existing?.pid || !existing?.outputPath) {
        throw new NoActiveRecordingError()
      }

      try {
        process.kill(existing.pid, "SIGINT")
      } catch {
        // process may have already exited
      }

      // Give CoreAudio time to flush the WAV header
      await new Promise((r) => setTimeout(r, STOP_FLUSH_MS))
      await clearState(stateOpts)
      return existing.outputPath
    },

    async status() {
      const existing = await readState(stateOpts)
      if (!existing?.pid) return null

      if (!isAlive(existing.pid)) {
        await clearState(stateOpts)
        return null
      }

      return new Recording({ pid: existing.pid, outputPath: existing.outputPath })
    },
  }
}
