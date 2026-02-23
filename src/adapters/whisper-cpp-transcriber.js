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

const normalizeText = (text) => text.replace(/\s+/g, " ").trim()

/**
 * Create a WhisperCppTranscriber that satisfies TranscriberPort.
 *
 * @param {{ bin: string, model: string, language?: string, threads?: number, extraArgs?: string[] }} opts
 * @returns {import('../ports/transcriber.js').TranscriberPort}
 */
export function createWhisperCppTranscriber({ bin, model, language, threads, extraArgs }) {
  if (!bin) throw new TranscriberConfigError("whisper-cli binary path is required")
  if (!model) throw new TranscriberConfigError("whisper model path is required")

  return {
    async transcribe(filePath) {
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
