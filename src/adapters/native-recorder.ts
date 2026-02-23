/**
 * Native macOS recorder adapter.
 *
 * Implements RecorderPort using the compiled Swift AVFoundation binary
 * (scripts/record). Records 16kHz mono 16-bit PCM WAV files suitable
 * for whisper-cli.
 *
 * When VAD is enabled, the recorder passes --vad flags to the Swift binary
 * which will auto-stop recording after sustained silence. The adapter
 * exposes a waitForStop() method that resolves when the process exits.
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
import type { RecorderPort } from "../ports/recorder.js"

const START_TIMEOUT_MS = 5_000
const STOP_FLUSH_MS = 500
const WAIT_POLL_MS = 200

// ---------------------------------------------------------------------------
// State persistence (pid + outputPath in a JSON file)
// ---------------------------------------------------------------------------

interface StateOpts {
  cacheDir?: string
}

interface RecordingState {
  pid: number
  outputPath: string
}

const statePath = (opts?: StateOpts): string => {
  const base = opts?.cacheDir ?? process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache")
  return path.join(base, "heycode", "recording.json")
}

const readState = async (opts?: StateOpts): Promise<RecordingState | null> => {
  try {
    const raw = await fs.readFile(statePath(opts), "utf8")
    return JSON.parse(raw) as RecordingState
  } catch {
    return null
  }
}

const writeState = async (state: RecordingState, opts?: StateOpts): Promise<void> => {
  const fp = statePath(opts)
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await fs.writeFile(fp, JSON.stringify(state, null, 2))
}

const clearState = async (opts?: StateOpts): Promise<void> => {
  try {
    await fs.unlink(statePath(opts))
  } catch {
    // already gone
  }
}

/** Check whether a process is still alive. */
const isAlive = (pid: number): boolean => {
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

interface NativeRecorderOpts {
  binPath: string
  cacheDir?: string
  vad?: {
    enabled?: boolean
    silenceDuration?: number
    silenceThreshold?: number
    gracePeriod?: number
  }
}

/**
 * Create a NativeRecorder that satisfies RecorderPort.
 */
export function createNativeRecorder({ binPath, cacheDir, vad }: NativeRecorderOpts): RecorderPort {
  const stateOpts: StateOpts = { cacheDir }
  const vadEnabled = vad?.enabled ?? false

  const recorder: RecorderPort = {
    async start() {
      const existing = await readState(stateOpts)
      if (existing?.pid && isAlive(existing.pid)) {
        throw new RecordingAlreadyActiveError()
      }

      // Clean stale state from a dead process
      if (existing) await clearState(stateOpts)

      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "heycode-audio-"))
      const outputPath = path.join(dir, `recording-${Date.now()}.wav`)

      const binArgs: string[] = [outputPath]

      // Pass VAD flags to the Swift binary
      if (vadEnabled) {
        binArgs.push("--vad")
        if (vad?.silenceDuration !== undefined) {
          binArgs.push("--silence-duration", String(vad.silenceDuration))
        }
        if (vad?.silenceThreshold !== undefined) {
          binArgs.push("--silence-threshold", String(vad.silenceThreshold))
        }
        if (vad?.gracePeriod !== undefined) {
          binArgs.push("--vad-grace", String(vad.gracePeriod))
        }
      }

      const child = execa(binPath, binArgs, {
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
      })

      // Wait for the "recording:<path>" confirmation line on stdout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new RecorderStartTimeoutError(START_TIMEOUT_MS))
        }, START_TIMEOUT_MS)

        child.stdout!.on("data", (data: Buffer) => {
          if (data.toString().trim().startsWith("recording:")) {
            clearTimeout(timeout)
            resolve()
          }
        })

        child.catch((err: Error) => {
          clearTimeout(timeout)
          reject(err)
        })
      })

      child.unref?.()
      await writeState({ pid: child.pid!, outputPath }, stateOpts)
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

  // Only expose waitForStop when VAD is enabled — the Swift binary
  // must have --vad flags to auto-stop on silence. Without them,
  // waitForStop would poll forever on a process that never exits.
  if (vadEnabled) {
    recorder.waitForStop = async (): Promise<string> => {
      // Poll until the recording process exits (auto-stop via VAD or signal)
      while (true) {
        const existing = await readState(stateOpts)
        if (!existing?.pid) {
          throw new NoActiveRecordingError()
        }

        if (!isAlive(existing.pid)) {
          const outputPath = existing.outputPath
          await clearState(stateOpts)
          return outputPath
        }

        await new Promise((r) => setTimeout(r, WAIT_POLL_MS))
      }
    }
  }

  return recorder
}
