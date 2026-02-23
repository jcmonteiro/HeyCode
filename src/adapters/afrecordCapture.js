import { execa } from "execa"
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const cacheRoot = () =>
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache")

const statePath = () => path.join(cacheRoot(), "speechd", "recording.json")

const writeState = async (state) => {
  const filePath = statePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(state, null, 2))
}

const readState = async () => {
  try {
    const raw = await fs.readFile(statePath(), "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const clearState = async () => {
  try {
    await fs.unlink(statePath())
  } catch {
    // ignore
  }
}

/**
 * Resolve the path to the native macOS recorder binary.
 * Falls back to the Swift source if the compiled binary doesn't exist.
 */
const resolveRecorderBin = () => {
  return path.resolve(__dirname, "../../scripts/record")
}

export const startRecording = async (_config) => {
  const existing = await readState()
  if (existing?.pid) {
    throw new Error("Recording already in progress")
  }

  const bin = resolveRecorderBin()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "speechd-audio-"))
  const outputPath = path.join(dir, `recording-${Date.now()}.wav`)

  const child = execa(bin, [outputPath], {
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  })

  // Wait for the "recording:<path>" line on stdout to confirm it started
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Recording failed to start within 5 seconds"))
    }, 5000)

    child.stdout.on("data", (data) => {
      const line = data.toString().trim()
      if (line.startsWith("recording:")) {
        clearTimeout(timeout)
        resolve()
      }
    })

    child.catch((err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  // Unref so the parent can exit independently
  child.unref?.()

  await writeState({ pid: child.pid, outputPath })
  return outputPath
}

export const stopRecording = async () => {
  const existing = await readState()
  if (!existing?.pid || !existing?.outputPath) {
    throw new Error("No recording in progress")
  }

  try {
    process.kill(existing.pid, "SIGINT")
  } catch {
    // process may have already exited
  }

  // Give it a moment to flush the WAV file
  await new Promise((resolve) => setTimeout(resolve, 500))

  await clearState()
  return existing.outputPath
}

export const getRecordingStatus = async () => {
  const existing = await readState()
  if (!existing?.pid) return null

  // Verify the process is still alive
  try {
    process.kill(existing.pid, 0)
    return existing
  } catch {
    // Process is dead, clean up stale state
    await clearState()
    return null
  }
}
