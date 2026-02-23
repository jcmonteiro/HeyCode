/**
 * Whisper.cpp transcriber adapter.
 *
 * Implements TranscriberPort by shelling out to whisper-cli.
 * Expects 16kHz mono WAV input (the format produced by the native recorder).
 */
import { execa } from "execa"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { Transcript } from "../domain/transcript.js"
import {
  TranscriberConfigError,
  TranscriptionFailedError,
} from "../domain/errors.js"
import type { TranscriberPort } from "../ports/transcriber.js"

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim()

interface WhisperCppOpts {
  bin: string
  model: string
  language?: string
  threads?: number
  extraArgs?: string[]
}

/**
 * Create a WhisperCppTranscriber that satisfies TranscriberPort.
 */
export function createWhisperCppTranscriber({ bin, model, language, threads, extraArgs }: WhisperCppOpts): TranscriberPort {
  if (!bin) throw new TranscriberConfigError("whisper-cli binary path is required")
  if (!model) throw new TranscriberConfigError("whisper model path is required")

  return {
    async transcribe(filePath: string): Promise<Transcript> {
      await fs.access(filePath)

      const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "speechd-"))
      const outputBase = path.join(outputDir, "transcript")

      const args = ["-m", model, "-f", filePath, "-otxt", "-of", outputBase]

      if (language && language !== "auto") {
        args.push("-l", language)
      }
      if (Number.isFinite(threads)) {
        args.push("-t", String(threads))
      }
      if (Array.isArray(extraArgs)) {
        args.push(...extraArgs)
      }

      try {
        await execa(bin, args, { stdout: "pipe", stderr: "pipe" })
      } catch (err) {
        throw new TranscriptionFailedError(
          "whisper.cpp",
          err instanceof Error ? err.message : String(err),
        )
      }

      const textPath = `${outputBase}.txt`
      const raw = await fs.readFile(textPath, "utf8")
      const text = normalizeText(raw)

      return new Transcript({
        text,
        meta: { provider: "whisper.cpp", model },
      })
    },
  }
}
