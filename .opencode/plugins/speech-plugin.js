/**
 * OpenCode Speech Plugin
 *
 * Provides speech-to-text for OpenCode:
 * - /speech command: toggles microphone recording, transcribes, appends to prompt
 * - speech_record tool: allows the LLM to trigger recording on behalf of the user
 *
 * Uses native macOS AVFoundation recorder + whisper-cli for transcription.
 * Appends transcript to the current session prompt (never creates a new session).
 *
 * This file lives in .opencode/plugins/ so it can resolve @opencode-ai/plugin
 * from .opencode/node_modules/.
 */
import { tool } from "@opencode-ai/plugin"
import { execa } from "execa"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Project root is two levels up from .opencode/plugins/ */
const projectRoot = () => path.resolve(__dirname, "..", "..")

const speechctlPath = () => path.join(projectRoot(), "bin", "speechctl.js")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run speechctl with given args and return stdout */
const speechctl = async (args) => {
  const { stdout } = await execa(process.execPath, [speechctlPath(), ...args], {
    cwd: projectRoot(),
    timeout: 60_000,
  })
  return stdout.trim()
}

// ---------------------------------------------------------------------------
// Core speech actions
// ---------------------------------------------------------------------------

/**
 * Toggle recording. Returns { action, outputPath? }
 */
const toggleRecording = async () => {
  const statusOutput = await speechctl(["record", "--status"])
  const isRecording = statusOutput.startsWith("recording:")

  if (!isRecording) {
    const output = await speechctl(["record"])
    if (!output.startsWith("recording:")) {
      throw new Error(`Failed to start recording: ${output}`)
    }
    return { action: "started" }
  }

  const output = await speechctl(["record"])
  if (!output.startsWith("stopped:")) {
    throw new Error(`Failed to stop recording: ${output}`)
  }
  const outputPath = output.replace("stopped:", "").trim()
  return { action: "stopped", outputPath }
}

/**
 * Transcribe an audio file. Returns the text (may be empty for silence).
 */
const transcribe = async (filePath) => {
  return await speechctl(["transcribe", filePath])
}

// ---------------------------------------------------------------------------
// Plugin (correct @opencode-ai/plugin API)
// ---------------------------------------------------------------------------

/** @type {import("@opencode-ai/plugin").Plugin} */
const SpeechPlugin = async ({ client }) => {
  // Track whether we've shown the load toast
  let greeted = false

  return {
    // -----------------------------------------------------------------------
    // Event handler — fires for every OpenCode event
    // -----------------------------------------------------------------------
    event: async ({ event }) => {
      // Show a one-time toast so the user knows the plugin loaded
      if (!greeted && event.type === "server.connected") {
        greeted = true
        try {
          await client.tui.showToast({
            body: { message: "Speech plugin loaded", variant: "success" },
          })
        } catch {
          // TUI might not be ready yet, that's OK
        }
      }
    },

    // -----------------------------------------------------------------------
    // Command hook — intercepts /speech before it reaches the LLM
    // -----------------------------------------------------------------------
    "command.execute.before": async (input, output) => {
      // input: { command: string, sessionID: string, arguments: string }
      // output: { parts: Part[] }
      const cmd = (input.command || "").trim()
      if (cmd !== "speech") return

      try {
        const args = (input.arguments || "").trim()

        // Case 1: /speech <filepath> — transcribe a given file
        if (args) {
          await client.tui.showToast({
            body: { message: "Transcribing file...", variant: "info" },
          })
          const text = await transcribe(args)
          if (!text) {
            await client.tui.showToast({
              body: { message: "No speech detected in file", variant: "warning" },
            })
            output.parts = []
            return
          }
          await client.tui.appendPrompt({ body: { text } })
          await client.tui.showToast({
            body: {
              message: "Transcript appended to prompt",
              variant: "success",
            },
          })
          // Set output parts to empty so the command isn't sent to the LLM
          output.parts = []
          return
        }

        // Case 2: /speech — toggle recording
        const result = await toggleRecording()

        if (result.action === "started") {
          await client.tui.showToast({
            body: {
              message: "Recording... type /speech again to stop",
              variant: "info",
              duration: 10_000,
            },
          })
          output.parts = []
          return
        }

        // Stopped — transcribe and append
        await client.tui.showToast({
          body: { message: "Transcribing...", variant: "info" },
        })
        const text = await transcribe(result.outputPath)
        if (!text) {
          await client.tui.showToast({
            body: { message: "No speech detected — try again", variant: "warning" },
          })
          output.parts = []
          return
        }
        await client.tui.appendPrompt({ body: { text } })
        await client.tui.showToast({
          body: {
            message: "Transcript appended to prompt",
            variant: "success",
          },
        })
        output.parts = []
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await client.tui.showToast({
          body: { message: `Speech error: ${message}`, variant: "error" },
        })
        output.parts = []
      }
    },

    // -----------------------------------------------------------------------
    // Custom tool — lets the LLM trigger recording
    // -----------------------------------------------------------------------
    tool: {
      speech_record: tool({
        description:
          "Toggle microphone recording for speech-to-text. " +
          "Call once to start recording, call again to stop, transcribe, and " +
          "return the transcript text. The user can speak into their microphone " +
          "and the transcript will be returned.",
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
          // Direct file transcription
          if (args.file) {
            const text = await transcribe(args.file)
            if (!text) return "No speech detected in the audio file."
            return `Transcript: ${text}`
          }

          // Toggle recording
          const result = await toggleRecording()

          if (result.action === "started") {
            try {
              await client.tui.showToast({
                body: {
                  message:
                    "Recording... the tool will be called again to stop",
                  variant: "info",
                  duration: 10_000,
                },
              })
            } catch {
              // ignore toast errors
            }
            return "Recording started. Call this tool again (without arguments) to stop and get the transcript."
          }

          // Stopped — transcribe
          try {
            await client.tui.showToast({
              body: { message: "Transcribing...", variant: "info" },
            })
          } catch {
            // ignore
          }

          const text = await transcribe(result.outputPath)

          if (!text) {
            try {
              await client.tui.showToast({
                body: { message: "No speech detected", variant: "warning" },
              })
            } catch {
              // ignore
            }
            return "No speech detected. The recording was silent. Ask the user to try again."
          }

          try {
            await client.tui.showToast({
              body: { message: "Transcription complete", variant: "success" },
            })
          } catch {
            // ignore
          }

          return `Transcript: ${text}`
        },
      }),
    },
  }
}

export default SpeechPlugin
