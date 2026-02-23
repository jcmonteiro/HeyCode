/**
 * OpenCode Speech Plugin
 *
 * Thin integration shell that wires the speech domain into OpenCode:
 *
 * - Hotkey daemon: spawns the native macOS hotkey binary at startup.
 *   When the global hotkey is pressed (default Cmd+Shift+Space), the plugin
 *   records from the microphone, transcribes via whisper.cpp, and injects the
 *   transcript into the TUI input field via client.tui.appendPrompt().
 *
 * - speech_record tool: allows the LLM to trigger recording on behalf of the
 *   user. Returns the transcript as a tool result string.
 *
 * All business logic lives in src/usecases/.
 * This file only handles OpenCode-specific concerns (daemon lifecycle, toasts,
 * TUI input injection).
 *
 * Lives in .opencode/plugins/ to resolve @opencode-ai/plugin from
 * .opencode/node_modules/.
 */
import { tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..", "..")

// ---------------------------------------------------------------------------
// Lazy-loaded dependencies (avoids top-level import issues in plugin context)
// ---------------------------------------------------------------------------

let _recorder = null
let _transcriber = null
let _vadEnabled = false
let _config = null

async function getDeps() {
  if (_recorder && _transcriber) return { recorder: _recorder, transcriber: _transcriber }

  const { loadConfig } = await import(
    path.join(projectRoot, "src", "config", "config.js")
  )
  const { createRecorder } = await import(
    path.join(projectRoot, "src", "factories", "create-recorder.js")
  )
  const { createTranscriber } = await import(
    path.join(projectRoot, "src", "factories", "create-transcriber.js")
  )

  _config = await loadConfig()
  _recorder = createRecorder(_config)
  _transcriber = createTranscriber(_config)
  _vadEnabled = _config.capture?.vad?.enabled ?? false
  return { recorder: _recorder, transcriber: _transcriber }
}

// ---------------------------------------------------------------------------
// Toast helpers (never throw — TUI may not be ready)
// ---------------------------------------------------------------------------

const toast = async (client, message, variant = "info") => {
  try {
    await client.tui.showToast({ body: { message, variant } })
  } catch {
    // TUI not ready
  }
}

// ---------------------------------------------------------------------------
// Hotkey daemon — spawns native binary, listens for trigger events
// ---------------------------------------------------------------------------

function startHotkeyDaemon(client) {
  let child = null
  let busy = false

  const start = async () => {
    // Ensure deps are loaded so we have config
    await getDeps()

    const hotkeyBin = _config?.capture?.hotkey?.bin
      || path.resolve(projectRoot, "scripts", "hotkey")
    const key = _config?.capture?.hotkey?.key || "space"
    const modifiers = _config?.capture?.hotkey?.modifiers || "cmd,shift"

    child = spawn(hotkeyBin, ["--key", key, "--modifiers", modifiers], {
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Wait for "ready" before processing triggers
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Hotkey daemon failed to start within 5s"))
      }, 5000)

      const onData = (data) => {
        const line = data.toString().trim()
        if (line === "ready") {
          clearTimeout(timeout)
          child.stdout.off("data", onData)
          resolve()
        }
        if (line.startsWith("error:")) {
          clearTimeout(timeout)
          reject(new Error(line.slice(6)))
        }
      }

      child.stdout.on("data", onData)

      child.on("error", (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    // Listen for hotkey triggers
    child.stdout.on("data", (data) => {
      const line = data.toString().trim()
      if (line === "triggered") {
        handleHotkey(client)
      }
    })

    child.stderr.on("data", (data) => {
      // Log but don't crash
      console.error(`[speech-plugin] hotkey stderr: ${data.toString().trim()}`)
    })

    child.on("exit", (code) => {
      if (child) {
        console.error(`[speech-plugin] hotkey daemon exited with code ${code}`)
      }
    })
  }

  const handleHotkey = async (client) => {
    if (busy) return
    busy = true

    try {
      const { recorder, transcriber } = await getDeps()
      const { recordAndTranscribe } = await import(
        path.join(projectRoot, "src", "usecases", "record-and-transcribe.js")
      )

      await toast(client, "Recording...", "info")

      const result = await recordAndTranscribe({
        recorder,
        transcriber,
        vadEnabled: _vadEnabled,
        onStarted: () => toast(client, "Recording...", "info"),
        onStopped: () => toast(client, "Transcribing...", "info"),
      })

      if (result.action === "started") {
        // Toggle mode without VAD: recording started, next hotkey stops it
        await toast(
          client,
          "Recording... press hotkey again to stop",
          "info",
        )
        busy = false
        return
      }

      if (result.action === "cancelled") {
        await toast(client, "Recording cancelled", "warning")
        busy = false
        return
      }

      // action === "stopped" — transcription complete
      if (result.transcript.isEmpty) {
        await toast(client, "No speech detected — try again", "warning")
        busy = false
        return
      }

      await toast(client, "Transcript ready", "success")
      try {
        await client.tui.appendPrompt({ body: { text: result.transcript.text } })
      } catch (err) {
        console.error(`[speech-plugin] failed to append prompt: ${err.message || err}`)
      }
    } catch (err) {
      await toast(client, `Speech error: ${err.message || err}`, "error")
    } finally {
      busy = false
    }
  }

  const stop = () => {
    if (child) {
      const pid = child.pid
      child = null
      try {
        process.kill(pid, "SIGTERM")
      } catch {
        // already gone
      }
    }
  }

  return { start, stop }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** @type {import("@opencode-ai/plugin").Plugin} */
const SpeechPlugin = async ({ client }) => {
  let greeted = false
  const daemon = startHotkeyDaemon(client)

  // Start daemon asynchronously — don't block plugin init
  daemon.start().then(() => {
    toast(client, "Speech plugin ready (Cmd+Shift+Space)", "success")
  }).catch((err) => {
    console.error(`[speech-plugin] daemon failed to start: ${err.message || err}`)
    toast(client, `Speech daemon failed: ${err.message || err}`, "error")
  })

  return {
    event: async ({ event }) => {
      if (!greeted && event.type === "server.connected") {
        greeted = true
      }

      // Clean up daemon when OpenCode exits
      if (event.type === "server.instance.disposed") {
        daemon.stop()
      }
    },

    tool: {
      speech_record: tool({
        description:
          "Record speech from the microphone and transcribe it. " +
          "With VAD enabled (default), recording auto-stops when you stop " +
          "speaking and returns the transcript. Without VAD, call once to " +
          "start and again to stop.",
        args: {
          file: tool.schema
            .string()
            .optional()
            .describe(
              "Optional path to an existing audio file to transcribe directly. " +
                "If omitted, records from the microphone.",
            ),
        },
        async execute(args) {
          const { recorder, transcriber } = await getDeps()

          // Direct file transcription
          if (args.file) {
            const { transcribeFile } = await import(
              path.join(projectRoot, "src", "usecases", "transcribe-file.js")
            )
            const transcript = await transcribeFile({ transcriber, filePath: args.file })
            if (transcript.isEmpty) return "No speech detected in the audio file."
            return `Transcript: ${transcript.text}`
          }

          // Record and transcribe (handles both VAD and toggle modes)
          const { recordAndTranscribe } = await import(
            path.join(projectRoot, "src", "usecases", "record-and-transcribe.js")
          )
          const result = await recordAndTranscribe({
            recorder,
            transcriber,
            vadEnabled: _vadEnabled,
          })

          if (result.action === "started") {
            await toast(client, "Recording... call again to stop")
            return "Recording started. Call this tool again (without arguments) to stop and get the transcript."
          }

          if (result.action === "cancelled") {
            return "Recording cancelled."
          }

          // action === "stopped"
          if (result.transcript.isEmpty) {
            await toast(client, "No speech detected", "warning")
            return "No speech detected. The recording was silent. Ask the user to try again."
          }

          await toast(client, "Transcription complete", "success")
          return `Transcript: ${result.transcript.text}`
        },
      }),
    },
  }
}

export default SpeechPlugin
