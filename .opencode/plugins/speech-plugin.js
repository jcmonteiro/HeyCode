/**
 * OpenCode Speech Plugin
 *
 * Thin integration shell that wires the speech domain into OpenCode:
 * - /speech command: records speech and transcribes to prompt
 *   - With VAD: one /speech starts recording, auto-stops on silence, transcribes
 *   - Without VAD: /speech toggles start/stop, transcribes on stop
 * - speech_record tool: allows the LLM to trigger recording on behalf of the user
 *
 * All business logic lives in src/usecases/ and src/adapters/.
 * This file only handles OpenCode-specific concerns (toasts, prompt appending).
 *
 * Lives in .opencode/plugins/ to resolve @opencode-ai/plugin from .opencode/node_modules/.
 */
import { tool } from "@opencode-ai/plugin"
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

  const config = await loadConfig()
  _recorder = createRecorder(config)
  _transcriber = createTranscriber(config)
  _vadEnabled = config.capture?.vad?.enabled ?? false
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
// Shared recording + transcription helpers
// ---------------------------------------------------------------------------

/**
 * Handle the VAD auto-stop flow: start → wait for silence → transcribe.
 * Returns the transcript or null if no speech detected.
 */
const recordWithVad = async (client, recorder, transcriber) => {
  const { startAndWaitRecording } = await import(
    path.join(projectRoot, "src", "usecases", "start-and-wait-recording.js")
  )

  const { transcript } = await startAndWaitRecording({
    recorder,
    transcriber,
    onStarted: () => toast(client, "Recording... will auto-stop on silence"),
    onStopped: () => toast(client, "Transcribing..."),
  })

  return transcript
}

/**
 * Handle the manual toggle flow: start/stop + transcribe.
 * Returns { action, transcript? }.
 */
const recordWithToggle = async (client, recorder, transcriber) => {
  const { toggleRecording } = await import(
    path.join(projectRoot, "src", "usecases", "toggle-recording.js")
  )
  const { transcribeFile } = await import(
    path.join(projectRoot, "src", "usecases", "transcribe-file.js")
  )

  const result = await toggleRecording({ recorder })

  if (result.action === "started") {
    return { action: "started" }
  }

  await toast(client, "Transcribing...")
  const transcript = await transcribeFile({
    transcriber,
    filePath: result.outputPath,
  })

  return { action: "stopped", transcript }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** @type {import("@opencode-ai/plugin").Plugin} */
const SpeechPlugin = async ({ client }) => {
  let greeted = false

  return {
    event: async ({ event }) => {
      if (!greeted && event.type === "server.connected") {
        greeted = true
        await toast(client, "Speech plugin loaded", "success")
      }
    },

    "command.execute.before": async (input, output) => {
      if ((input.command || "").trim() !== "speech") return

      try {
        const { recorder, transcriber } = await getDeps()
        const args = (input.arguments || "").trim()

        // /speech <filepath> — transcribe a given file directly
        if (args) {
          const { transcribeFile } = await import(
            path.join(projectRoot, "src", "usecases", "transcribe-file.js")
          )
          await toast(client, "Transcribing file...")
          const transcript = await transcribeFile({ transcriber, filePath: args })
          if (transcript.isEmpty) {
            await toast(client, "No speech detected in file", "warning")
          } else {
            await client.tui.appendPrompt({ body: { text: transcript.text } })
            await toast(client, "Transcript appended to prompt", "success")
          }
          output.parts = []
          return
        }

        // VAD mode: single /speech starts recording and auto-stops on silence
        if (_vadEnabled && typeof recorder.waitForStop === "function") {
          // Check if already recording — if so, force stop (escape hatch)
          const status = await recorder.status()
          if (status) {
            await recorder.stop()
            await toast(client, "Recording cancelled", "warning")
            output.parts = []
            return
          }

          const transcript = await recordWithVad(client, recorder, transcriber)

          if (transcript.isEmpty) {
            await toast(client, "No speech detected — try again", "warning")
          } else {
            await client.tui.appendPrompt({ body: { text: transcript.text } })
            await toast(client, "Transcript appended to prompt", "success")
          }
          output.parts = []
          return
        }

        // Manual toggle mode: /speech to start, /speech again to stop
        const result = await recordWithToggle(client, recorder, transcriber)

        if (result.action === "started") {
          await toast(client, "Recording... type /speech again to stop")
          output.parts = []
          return
        }

        if (result.transcript.isEmpty) {
          await toast(client, "No speech detected — try again", "warning")
        } else {
          await client.tui.appendPrompt({ body: { text: result.transcript.text } })
          await toast(client, "Transcript appended to prompt", "success")
        }
        output.parts = []
      } catch (err) {
        await toast(client, `Speech error: ${err.message || err}`, "error")
        output.parts = []
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

          // VAD mode: record → auto-stop → transcribe in one call
          if (_vadEnabled && typeof recorder.waitForStop === "function") {
            const status = await recorder.status()
            if (status) {
              await recorder.stop()
              return "Recording cancelled."
            }

            await toast(client, "Recording... will auto-stop on silence")
            const transcript = await recordWithVad(client, recorder, transcriber)

            if (transcript.isEmpty) {
              await toast(client, "No speech detected", "warning")
              return "No speech detected. The recording was silent. Ask the user to try again."
            }

            await toast(client, "Transcription complete", "success")
            return `Transcript: ${transcript.text}`
          }

          // Manual toggle mode
          const { toggleRecording } = await import(
            path.join(projectRoot, "src", "usecases", "toggle-recording.js")
          )
          const { transcribeFile } = await import(
            path.join(projectRoot, "src", "usecases", "transcribe-file.js")
          )

          const result = await toggleRecording({ recorder })

          if (result.action === "started") {
            await toast(client, "Recording... the tool will be called again to stop")
            return "Recording started. Call this tool again (without arguments) to stop and get the transcript."
          }

          await toast(client, "Transcribing...")
          const transcript = await transcribeFile({
            transcriber,
            filePath: result.outputPath,
          })

          if (transcript.isEmpty) {
            await toast(client, "No speech detected", "warning")
            return "No speech detected. The recording was silent. Ask the user to try again."
          }

          await toast(client, "Transcription complete", "success")
          return `Transcript: ${transcript.text}`
        },
      }),
    },
  }
}

export default SpeechPlugin
