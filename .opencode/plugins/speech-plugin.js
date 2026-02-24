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
 * - /speech command: explicit trigger for recording. With VAD, one invocation
 *   records until silence. Without VAD, toggles start/stop. The transcript
 *   replaces the command's text part so it becomes the user message.
 *
 * - speech_record tool: allows the LLM to trigger recording on behalf of the
 *   user. Returns the transcript as a tool result string.
 *
 * All business logic lives in src/usecases/.
 * This file only handles OpenCode-specific concerns (daemon lifecycle,
 * command parts, TUI input injection).
 *
 * Lives in .opencode/plugins/ to resolve @opencode-ai/plugin from
 * .opencode/node_modules/.
 */
import { tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// ---------------------------------------------------------------------------
// Path resolution — resolve symlinks so __dirname always points to the real
// plugin location, not the symlink in ~/.config/opencode/plugins/.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)))
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
// Command output helpers
// ---------------------------------------------------------------------------

/**
 * Find the first text part in the output.parts array.
 * OpenCode pre-populates parts from the command template —
 * we must modify existing parts, never replace the array, because
 * the parts carry server-assigned ids (id, sessionID, messageID).
 * Replacing the array with new objects lacking those fields causes
 * a 400 "Bad request" error.
 */
const findTextPart = (parts) =>
  parts.find((p) => p.type === "text")

/**
 * Rewrite the command's text part so the message carries the given content.
 * If no text part exists, we push a minimal one (shouldn't happen with
 * a well-configured template, but guards against edge cases).
 */
const setCommandText = (output, text) => {
  const part = findTextPart(output.parts)
  if (part) {
    part.text = text
  } else {
    output.parts.push({ type: "text", text })
  }
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

    child.stderr.on("data", () => {
      // Silently ignore — hotkey binary stderr is not actionable
    })

    child.on("exit", () => {
      if (child) {
        toast(client, "Hotkey daemon exited unexpectedly", "error")
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

      const result = await recordAndTranscribe({
        recorder,
        transcriber,
        vadEnabled: _vadEnabled,
        onStarted: () => toast(client, "Recording..."),
        onStopped: () => toast(client, "Transcribing..."),
      })

      if (result.action === "started") {
        await toast(
          client,
          _vadEnabled
            ? "Recording... will auto-stop on silence"
            : "Recording... press hotkey again to stop",
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
      } catch {
        await toast(client, "Failed to append transcript to prompt", "error")
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
// Shared record-and-transcribe helper (used by both /speech and hotkey)
// ---------------------------------------------------------------------------

const recordAndTranscribeWithStatus = async () => {
  const { recorder, transcriber } = await getDeps()
  const { recordAndTranscribe } = await import(
    path.join(projectRoot, "src", "usecases", "record-and-transcribe.js")
  )

  const result = await recordAndTranscribe({
    recorder,
    transcriber,
    vadEnabled: _vadEnabled,
  })

  return result
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
    toast(client, `Speech daemon failed: ${err.message || err}`, "error")
  })

  return {
    event: async ({ event }) => {
      if (!greeted && event.type === "server.connected") {
        greeted = true
        await toast(client, "Speech plugin loaded", "success")
      }

      // Clean up daemon when OpenCode exits
      if (event.type === "server.instance.disposed") {
        daemon.stop()
      }
    },

    "command.execute.before": async (input, output) => {
      if ((input.command || "").trim() !== "speech") return

      try {
        const args = (input.arguments || "").trim()

        // /speech <filepath> — transcribe a given file directly
        if (args) {
          const { transcriber } = await getDeps()
          const { transcribeFile } = await import(
            path.join(projectRoot, "src", "usecases", "transcribe-file.js")
          )
          await toast(client, "Transcribing file...")
          const transcript = await transcribeFile({ transcriber, filePath: args })
          if (transcript.isEmpty) {
            setCommandText(output, "[No speech detected in file]")
            await toast(client, "No speech detected in file", "warning")
          } else {
            setCommandText(output, transcript.text)
            await toast(client, "Transcript ready", "success")
          }
          return
        }

        // Record and transcribe (handles both VAD and toggle modes)
        const result = await recordAndTranscribeWithStatus()

        if (result.action === "started") {
          await toast(
            client,
            _vadEnabled
              ? "Recording... will auto-stop on silence"
              : "Recording... type /speech again to stop",
          )
          setCommandText(
            output,
            "[Recording started — say /speech again to stop and transcribe]",
          )
          return
        }

        if (result.action === "cancelled") {
          await toast(client, "Recording cancelled", "warning")
          setCommandText(output, "[Recording cancelled]")
          return
        }

        // action === "stopped"
        if (result.transcript.isEmpty) {
          await toast(client, "No speech detected — try again", "warning")
          setCommandText(output, "[No speech detected]")
          return
        }

        await toast(client, "Transcript ready", "success")
        setCommandText(output, result.transcript.text)
      } catch (err) {
        await toast(client, `Speech error: ${err.message || err}`, "error")
        setCommandText(output, `[Speech error: ${err.message || err}]`)
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
          const result = await recordAndTranscribeWithStatus()

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
