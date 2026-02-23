/**
 * Hotkey daemon shell.
 *
 * Spawns the native macOS hotkey binary and listens for trigger events.
 * When a hotkey is pressed, delegates to the recordAndTranscribe use case.
 *
 * This is NOT an adapter (does not implement a port). It's a top-level
 * integration shell, like the plugin and CLI, that wires ports to use cases.
 */
import { execa } from "execa"
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { recordAndTranscribe } from "../usecases/record-and-transcribe.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_TRIGGER_PATH = path.join(
  os.homedir(), ".cache", "speechd", "hotkey-trigger",
)

/**
 * Create and start the hotkey daemon.
 *
 * @param {{
 *   recorder: import('../ports/recorder.js').RecorderPort,
 *   transcriber: import('../ports/transcriber.js').TranscriberPort,
 *   hotkeyBin?: string,
 *   key?: string,
 *   modifiers?: string,
 *   triggerPath?: string,
 *   vadEnabled?: boolean,
 *   onTranscript?: (text: string) => void,
 *   onError?: (err: Error) => void,
 *   onStatusChange?: (status: string) => void,
 * }} opts
 * @returns {{ ready: Promise<void>, stop: () => void }}
 */
export function createHotkeyDaemon({
  recorder,
  transcriber,
  hotkeyBin,
  key = "space",
  modifiers = "cmd,shift",
  triggerPath = DEFAULT_TRIGGER_PATH,
  vadEnabled = false,
  onTranscript,
  onError,
  onStatusChange,
}) {
  const bin = hotkeyBin || path.resolve(__dirname, "../../scripts/hotkey")
  let stopped = false
  let child = null

  const emit = (status) => onStatusChange?.(status)

  const handleTrigger = async () => {
    try {
      // Clean up trigger file immediately
      try {
        await fs.unlink(triggerPath)
      } catch {
        // already cleaned
      }

      emit("recording")

      const result = await recordAndTranscribe({
        recorder,
        transcriber,
        vadEnabled,
        onStarted: () => emit("recording"),
        onStopped: () => emit("transcribing"),
      })

      if (result.action === "started") {
        // Toggle mode: recording started, user presses hotkey again to stop
        return
      }

      if (result.action === "cancelled") {
        emit("idle")
        onTranscript?.("")
        return
      }

      // action === "stopped" — transcription complete
      emit("idle")
      onTranscript?.(result.transcript.isEmpty ? "" : result.transcript.text)
    } catch (err) {
      emit("error")
      onError?.(err)
    }
  }

  const startWatching = async () => {
    // Ensure trigger directory exists
    await fs.mkdir(path.dirname(triggerPath), { recursive: true })

    // Start the native hotkey binary
    const args = ["--key", key, "--modifiers", modifiers, "--trigger-path", triggerPath]
    child = execa(bin, args, { stdout: "pipe", stderr: "pipe" })

    // Wait for "ready" from the binary
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Hotkey daemon failed to start within 5 seconds"))
      }, 5000)

      child.stdout.on("data", (data) => {
        const line = data.toString().trim()
        if (line === "ready") {
          clearTimeout(timeout)
          resolve()
        }
      })

      child.catch((err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    // Listen for trigger events via stdout
    child.stdout.on("data", (data) => {
      const line = data.toString().trim()
      if (line === "triggered") {
        handleTrigger()
      }
    })

    child.on("exit", () => {
      if (!stopped) {
        onError?.(new Error("Hotkey daemon exited unexpectedly"))
      }
    })

    emit("idle")
  }

  // Start asynchronously
  const ready = startWatching().catch((err) => {
    onError?.(err)
  })

  return {
    /** Promise that resolves when the daemon is ready. */
    ready,

    /** Stop the daemon. */
    stop() {
      stopped = true
      if (child?.pid) {
        try {
          process.kill(child.pid, "SIGTERM")
        } catch {
          // already gone
        }
      }
      emit("stopped")
    },
  }
}
