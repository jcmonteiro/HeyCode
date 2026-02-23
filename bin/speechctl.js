#!/usr/bin/env node
/**
 * speechctl — CLI for the speech-to-text system.
 *
 * Thin shell: loads config, wires factories, delegates to use cases.
 *
 * Commands:
 *   record [--status]        Toggle recording or check status
 *   record --listen          Record with VAD auto-stop and transcribe
 *   transcribe <file>        Transcribe an audio file
 *   stream                   Real-time streaming transcription
 *   daemon                   Run hotkey daemon (Cmd+Shift+Space to record)
 */
import { Command } from "commander"
import { loadConfig } from "../src/config/config.js"
import { createRecorder } from "../src/factories/create-recorder.js"
import { createTranscriber } from "../src/factories/create-transcriber.js"
import { toggleRecording } from "../src/usecases/toggle-recording.js"
import { recordAndTranscribe } from "../src/usecases/record-and-transcribe.js"
import { transcribeFile } from "../src/usecases/transcribe-file.js"

const program = new Command()

program
  .name("speechctl")
  .description("Speech-to-text CLI")
  .version("1.0.0")

program
  .command("transcribe")
  .description("Transcribe an audio file")
  .argument("<file>", "Path to audio file")
  .option("--json", "Output JSON")
  .action(async (file, options) => {
    const config = await loadConfig()
    const transcriber = createTranscriber(config)
    const transcript = await transcribeFile({ transcriber, filePath: file })

    if (options.json) {
      process.stdout.write(
        JSON.stringify({ text: transcript.text, meta: transcript.meta }, null, 2),
      )
      return
    }
    process.stdout.write(`${transcript.text}\n`)
  })

program
  .command("record")
  .description("Toggle recording or check status")
  .option("--status", "Print current recording status")
  .option("--listen", "Record with VAD auto-stop, transcribe, and print result")
  .option("--json", "Output JSON (with --listen)")
  .action(async (options) => {
    const config = await loadConfig()
    const recorder = createRecorder(config)

    if (options.status) {
      const status = await recorder.status()
      process.stdout.write(
        status ? `recording:${status.outputPath}\n` : "idle\n",
      )
      return
    }

    // --listen: record → auto-stop on silence → transcribe → print
    if (options.listen) {
      const transcriber = createTranscriber(config)

      const result = await recordAndTranscribe({
        recorder,
        transcriber,
        vadEnabled: true,
        onStarted: () => process.stderr.write("Listening... (will stop on silence)\n"),
        onStopped: (p) => process.stderr.write(`Stopped. Transcribing ${p}...\n`),
      })

      if (result.action !== "stopped") {
        process.stderr.write("Unexpected state\n")
        return
      }

      if (options.json) {
        process.stdout.write(
          JSON.stringify({ text: result.transcript.text, meta: result.transcript.meta }, null, 2),
        )
        return
      }
      process.stdout.write(`${result.transcript.text}\n`)
      return
    }

    // Default: toggle recording (no transcription)
    const result = await toggleRecording({ recorder })

    if (result.action === "started") {
      const status = await recorder.status()
      process.stdout.write(`recording:${status?.outputPath ?? "unknown"}\n`)
      return
    }

    process.stdout.write(`stopped:${result.outputPath}\n`)
  })

program
  .command("stream")
  .description("Real-time streaming transcription from microphone")
  .action(async () => {
    const { createStreamingTranscriber } = await import(
      "../src/factories/create-streaming-transcriber.js"
    )
    const config = await loadConfig()
    const streamer = createStreamingTranscriber(config)

    process.stderr.write("Starting streaming transcription...\n")
    process.stderr.write("Press Ctrl+C to stop.\n")

    await streamer.start({
      onPartial: (text) => {
        process.stdout.write(`\r\x1b[2K${text}`)
      },
    })

    // Keep alive until SIGINT
    process.on("SIGINT", async () => {
      const transcript = await streamer.stop()
      process.stdout.write(`\n`)
      if (transcript.text) {
        process.stderr.write(`Final: ${transcript.text}\n`)
      }
      process.exit(0)
    })
  })

program
  .command("daemon")
  .description("Run hotkey daemon (press global hotkey to record/transcribe)")
  .option("--key <key>", "Hotkey key", "space")
  .option("--modifiers <mods>", "Hotkey modifiers (comma-separated)", "cmd,shift")
  .option("--clipboard", "Copy transcript to clipboard instead of printing")
  .action(async (options) => {
    const { createHotkeyDaemon } = await import(
      "../src/shells/hotkey-daemon.js"
    )
    const config = await loadConfig()
    const recorder = createRecorder(config)
    const transcriber = createTranscriber(config)

    process.stderr.write(
      `Starting hotkey daemon (${options.modifiers}+${options.key})...\n`,
    )

    const daemon = createHotkeyDaemon({
      recorder,
      transcriber,
      key: options.key,
      modifiers: options.modifiers,
      vadEnabled: config.capture?.vad?.enabled ?? false,
      onTranscript: async (text) => {
        if (!text) {
          process.stderr.write("(no speech detected)\n")
          return
        }
        if (options.clipboard) {
          const { execa: execaFn } = await import("execa")
          await execaFn("pbcopy", { input: text })
          process.stderr.write(`Copied to clipboard: ${text.slice(0, 80)}...\n`)
        } else {
          process.stdout.write(`${text}\n`)
        }
      },
      onError: (err) => {
        process.stderr.write(`Error: ${err.message}\n`)
      },
      onStatusChange: (status) => {
        process.stderr.write(`[${status}]\n`)
      },
    })

    await daemon.ready

    process.stderr.write(
      `Hotkey daemon ready. Press ${options.modifiers}+${options.key} to record.\n`,
    )
    process.stderr.write("Press Ctrl+C to stop.\n")

    // Keep alive until SIGINT
    process.on("SIGINT", () => {
      daemon.stop()
      process.exit(0)
    })
  })

program.parseAsync(process.argv)
