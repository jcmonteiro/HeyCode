#!/usr/bin/env node
/**
 * speechctl — CLI for the speech-to-text system.
 *
 * Thin shell: loads config, wires factories, delegates to use cases.
 *
 * Commands:
 *   record [--status]        Toggle recording or check status
 *   transcribe <file>        Transcribe an audio file
 */
import { Command } from "commander"
import { loadConfig } from "../src/config/config.js"
import { createRecorder } from "../src/factories/create-recorder.js"
import { createTranscriber } from "../src/factories/create-transcriber.js"
import { toggleRecording } from "../src/usecases/toggle-recording.js"
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

    const result = await toggleRecording({ recorder })

    if (result.action === "started") {
      // Read back the state to get the output path for the user
      const status = await recorder.status()
      process.stdout.write(`recording:${status?.outputPath ?? "unknown"}\n`)
      return
    }

    process.stdout.write(`stopped:${result.outputPath}\n`)
  })

program.parseAsync(process.argv)
