#!/usr/bin/env node
import { Command } from "commander"
import { loadConfig } from "../src/config/config.js"
import { transcribeFile } from "../src/usecases/transcribeFile.js"
import { createSessionWithPrompt } from "../src/usecases/createOpencodeSession.js"
import {
  startRecording,
  stopRecording,
  getRecordingStatus,
} from "../src/adapters/afrecordCapture.js"

const program = new Command()

program
  .name("speechctl")
  .description("Speech daemon CLI")
  .version("1.0.0")

program
  .command("transcribe")
  .description("Transcribe an audio file")
  .argument("<file>", "Path to audio file")
  .option("--json", "Output JSON")
  .action(async (file, options) => {
    const config = await loadConfig()
    const transcript = await transcribeFile({ config, filePath: file })
    if (options.json) {
      process.stdout.write(
        JSON.stringify({ text: transcript.text, meta: transcript.meta }, null, 2),
      )
      return
    }
    process.stdout.write(`${transcript.text}\n`)
  })

program
  .command("opencode")
  .description("Transcribe a file and open a new OpenCode session")
  .argument("<file>", "Path to audio file")
  .option("--base-url <url>", "OpenCode server URL", "http://127.0.0.1:4096")
  .action(async (file, options) => {
    const config = await loadConfig()
    const transcript = await transcribeFile({ config, filePath: file })
    const session = await createSessionWithPrompt({
      baseUrl: options.baseUrl,
      prompt: transcript.text,
    })
    process.stdout.write(
      JSON.stringify({ sessionId: session.id, text: transcript.text }, null, 2),
    )
  })

program
  .command("record")
  .description("Toggle recording with afrecord")
  .option("--status", "Print current recording status")
  .action(async (options) => {
    const config = await loadConfig()
    if (options.status) {
      const status = await getRecordingStatus()
      process.stdout.write(
        status ? `recording:${status.outputPath}\n` : "idle\n",
      )
      return
    }

    const status = await getRecordingStatus()
    if (!status) {
      const outputPath = await startRecording(config)
      process.stdout.write(`recording:${outputPath}\n`)
      return
    }

    const outputPath = await stopRecording()
    process.stdout.write(`stopped:${outputPath}\n`)
  })

program.parseAsync(process.argv)
