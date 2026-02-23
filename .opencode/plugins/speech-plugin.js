/**
 * OpenCode Speech Plugin
 *
 * Thin integration shell that wires the speech domain into OpenCode:
 * - /speech command: toggles microphone recording, transcribes, appends to prompt
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
        const { toggleRecording } = await import(
          path.join(projectRoot, "src", "usecases", "toggle-recording.js")
        )
        const { transcribeFile } = await import(
          path.join(projectRoot, "src", "usecases", "transcribe-file.js")
        )
        const { recorder, transcriber } = await getDeps()
        const args = (input.arguments || "").trim()

        // /speech <filepath> — transcribe a given file directly
        if (args) {
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

        // /speech — toggle recording
        const result = await toggleRecording({ recorder })

        if (result.action === "started") {
          await toast(client, "Recording... type /speech again to stop")
          output.parts = []
          return
        }

        // Stopped — transcribe and append
        await toast(client, "Transcribing...")
        const transcript = await transcribeFile({
          transcriber,
          filePath: result.outputPath,
        })

        if (transcript.isEmpty) {
          await toast(client, "No speech detected — try again", "warning")
        } else {
          await client.tui.appendPrompt({ body: { text: transcript.text } })
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
          "Toggle microphone recording for speech-to-text. " +
          "Call once to start recording, call again to stop, transcribe, and " +
          "return the transcript text.",
        args: {
          file: tool.schema
            .string()
            .optional()
            .describe(
              "Optional path to an existing audio file to transcribe directly. " +
                "If omitted, toggles live microphone recording.",
            ),
        },
        async execute(args) {
          const { toggleRecording } = await import(
            path.join(projectRoot, "src", "usecases", "toggle-recording.js")
          )
          const { transcribeFile } = await import(
            path.join(projectRoot, "src", "usecases", "transcribe-file.js")
          )
          const { recorder, transcriber } = await getDeps()

          // Direct file transcription
          if (args.file) {
            const transcript = await transcribeFile({ transcriber, filePath: args.file })
            if (transcript.isEmpty) return "No speech detected in the audio file."
            return `Transcript: ${transcript.text}`
          }

          // Toggle recording
          const result = await toggleRecording({ recorder })

          if (result.action === "started") {
            await toast(client, "Recording... the tool will be called again to stop")
            return "Recording started. Call this tool again (without arguments) to stop and get the transcript."
          }

          // Stopped — transcribe
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
