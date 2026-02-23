/**
 * Hotkey daemon adapter.
 *
 * Spawns the native macOS hotkey binary and watches for trigger events.
 * When a hotkey is pressed, it orchestrates the record → transcribe pipeline.
 *
 * This adapter does NOT implement a port — it's a top-level orchestrator
 * that uses RecorderPort and TranscriberPort through use cases.
 */
import { execa } from "execa"
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"

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
 *   onTranscript?: (text: string) => void,
 *   onError?: (err: Error) => void,
 *   onStatusChange?: (status: string) => void,
 * }} opts
 * @returns {{ stop: () => void }}
 */
export function createHotkeyDaemon({
  recorder,
  transcriber,
  hotkeyBin,
  key = "space",
  modifiers = "cmd,shift",
  triggerPath = DEFAULT_TRIGGER_PATH,
  onTranscript,
  onError,
  onStatusChange,
}) {
  const bin = hotkeyBin || path.resolve(__dirname, "../../scripts/hotkey")
  let stopped = false
  let child = null
  let watcher = null

  const emit = (status) => onStatusChange?.(status)

  const handleTrigger = async () => {
    try {
      // Clean up trigger file immediately
      try {
        await fs.unlink(triggerPath)
      } catch {
        // already cleaned
      }

      const status = await recorder.status()

      if (status) {
        // Currently recording — stop it
        emit("stopping")
        const outputPath = await recorder.stop()
        emit("transcribing")

        const { transcribeFile } = await import("../usecases/transcribe-file.js")
        const transcript = await transcribeFile({ transcriber, filePath: outputPath })

        if (transcript.isEmpty) {
          emit("idle")
          onTranscript?.("")
        } else {
          emit("idle")
          onTranscript?.(transcript.text)
        }
      } else {
        // Not recording — start
        emit("recording")
        await recorder.start()

        // If VAD is enabled (recorder has waitForStop), use auto-stop flow
        if (typeof recorder.waitForStop === "function") {
          const outputPath = await recorder.waitForStop()
          emit("transcribing")

          const { transcribeFile } = await import("../usecases/transcribe-file.js")
          const transcript = await transcribeFile({ transcriber, filePath: outputPath })

          emit("idle")
          onTranscript?.(transcript.isEmpty ? "" : transcript.text)
        }
        // Without VAD, user presses hotkey again to stop (handled by the if-branch above)
      }
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
      if (watcher) {
        watcher.close()
      }
      emit("stopped")
    },
  }
}
