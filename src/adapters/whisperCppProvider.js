import { execa } from "execa"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { Transcript } from "../domain/transcript.js"

const ensureFileExists = async (filePath) => {
  await fs.access(filePath)
}

const normalizeText = (text) => text.replace(/\s+/g, " ").trim()

export class WhisperCppProvider {
  constructor(config) {
    this.config = config
  }

  async transcribeFile(filePath) {
    await ensureFileExists(filePath)
    const whisperConfig = this.config.provider.whisperCpp

    const bin = whisperConfig.bin
    const model = whisperConfig.model
    if (!bin || !model) {
      throw new Error("whisper.cpp bin and model must be configured")
    }

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "speechd-"))
    const outputBase = path.join(outputDir, "transcript")

    const args = ["-m", model, "-f", filePath, "-otxt", "-of", outputBase]

    if (whisperConfig.language && whisperConfig.language !== "auto") {
      args.push("-l", whisperConfig.language)
    }

    if (Number.isFinite(whisperConfig.threads)) {
      args.push("-t", String(whisperConfig.threads))
    }

    if (Array.isArray(whisperConfig.extraArgs)) {
      args.push(...whisperConfig.extraArgs)
    }

    await execa(bin, args, { stdout: "pipe", stderr: "pipe" })

    const textPath = `${outputBase}.txt`
    const raw = await fs.readFile(textPath, "utf8")
    const text = normalizeText(raw)

    return new Transcript({
      text,
      meta: {
        provider: "whisper.cpp",
        model,
        outputPath: textPath,
      },
    })
  }
}
