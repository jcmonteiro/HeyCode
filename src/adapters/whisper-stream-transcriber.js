/**
 * Whisper-stream adapter for streaming transcription.
 *
 * Implements StreamingTranscriberPort by running whisper-stream, which
 * captures audio from the microphone and transcribes in real-time.
 *
 * This replaces the separate recorder + transcriber pipeline with a single
 * process that handles both.
 */
import { execa } from "execa"
import { Transcript } from "../domain/transcript.js"
import {
  TranscriberConfigError,
  TranscriptionFailedError,
} from "../domain/errors.js"

const ANSI_REGEX = /\x1B\[[0-9;]*[A-Za-z]/g

/** Strip ANSI escape codes and normalize whitespace. */
const cleanOutput = (text) =>
  text.replace(ANSI_REGEX, "").replace(/\s+/g, " ").trim()

/**
 * Create a whisper-stream streaming transcriber.
 *
 * @param {{
 *   bin?: string,
 *   model: string,
 *   language?: string,
 *   threads?: number,
 *   stepMs?: number,
 *   lengthMs?: number,
 *   captureDevice?: number,
 *   vadThreshold?: number,
 * }} opts
 * @returns {import('../ports/streaming-transcriber.js').StreamingTranscriberPort}
 */
export function createWhisperStreamTranscriber({
  bin = "whisper-stream",
  model,
  language = "en",
  threads,
  stepMs = 3000,
  lengthMs = 10000,
  captureDevice,
  vadThreshold,
}) {
  if (!model) throw new TranscriberConfigError("whisper model path is required")

  let child = null
  let active = false
  let accumulatedText = ""

  return {
    async start({ onPartial } = {}) {
      if (active) return

      const args = ["-m", model, "--step", String(stepMs), "--length", String(lengthMs)]

      if (language) args.push("-l", language)
      if (Number.isFinite(threads)) args.push("-t", String(threads))
      if (Number.isFinite(captureDevice)) args.push("-c", String(captureDevice))
      if (Number.isFinite(vadThreshold)) args.push("-vth", String(vadThreshold))

      // Don't keep context — each chunk is independent for cleaner output
      // args.push("-kc") // uncomment if you want context carryover

      child = execa(bin, args, {
        stdout: "pipe",
        stderr: "pipe",
      })

      active = true
      accumulatedText = ""

      // Parse stdout for transcription output
      child.stdout.on("data", (chunk) => {
        const line = chunk.toString()
        const cleaned = cleanOutput(line)

        if (cleaned && !cleaned.startsWith("[")) {
          // This is transcription output (not [Start speaking] markers)
          accumulatedText = cleaned
          onPartial?.(cleaned)
        }
      })

      child.catch(() => {
        // Process exits on stop — ignore errors during normal teardown
      })

      // Wait for whisper-stream to initialize (look for [Start speaking] marker)
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve() // resolve anyway — might not see the marker
        }, 15000)

        const handler = (data) => {
          if (data.toString().includes("[Start speaking]")) {
            clearTimeout(timeout)
            child.stderr.off("data", handler)
            resolve()
          }
        }

        child.stderr.on("data", handler)

        child.catch((err) => {
          clearTimeout(timeout)
          if (active) reject(new TranscriptionFailedError("whisper-stream", err.message))
        })
      })
    },

    async stop() {
      if (!active || !child) {
        return new Transcript({ text: "", meta: { provider: "whisper-stream" } })
      }

      active = false

      // Send SIGINT to gracefully stop whisper-stream
      try {
        if (child.pid) process.kill(child.pid, "SIGINT")
      } catch {
        // already gone
      }

      // Wait briefly for final output
      await new Promise((r) => setTimeout(r, 500))

      try {
        child.kill()
      } catch {
        // already gone
      }

      child = null

      const text = accumulatedText
      accumulatedText = ""

      return new Transcript({
        text,
        meta: { provider: "whisper-stream", model },
      })
    },

    isActive() {
      return active
    },
  }
}
