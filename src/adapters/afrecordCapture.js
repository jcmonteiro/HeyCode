import { execa } from "execa"
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"
import osModule from "node:os"

const cacheRoot = () =>
  process.env.XDG_CACHE_HOME || path.join(osModule.homedir(), ".cache")

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

export const startRecording = async (config) => {
  const existing = await readState()
  if (existing?.pid) {
    throw new Error("Recording already in progress")
  }

  const afConfig = config.capture.afrecord
  const bin = afConfig.bin || "afrecord"
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "speechd-audio-"))
  const outputPath = path.join(dir, `recording-${Date.now()}.wav`)

  const args = [
    "-f",
    afConfig.format || "cd",
    "-t",
    afConfig.type || "wav",
    outputPath,
  ]

  if (afConfig.device) {
    args.unshift("-D", afConfig.device)
  }

  const child = execa(bin, args, {
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
  })

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
    // ignore
  }

  await clearState()
  return existing.outputPath
}

export const getRecordingStatus = async () => {
  const existing = await readState()
  return existing?.pid ? existing : null
}
