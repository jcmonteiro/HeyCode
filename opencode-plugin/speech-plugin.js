import { execa } from "execa"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { fileURLToPath } from "node:url"
import path from "node:path"

const commandPrefix = "/speech"

export const SpeechPlugin = async () => {
  const scriptPath = fileURLToPath(
    new URL("../../bin/speechctl.js", import.meta.url),
  )
  return {
    "tui.command.execute": async (input) => {
      if (!input.command?.startsWith(commandPrefix)) return

      const args = input.command.replace(commandPrefix, "").trim()
      if (!args) {
        throw new Error("Usage: /speech <audio-file-path>")
      }

      const { stdout } = await execa(process.execPath, [scriptPath, "transcribe", args], {
        cwd: path.dirname(scriptPath),
      })
      const text = stdout.trim()
      if (!text) {
        throw new Error("No transcription produced")
      }

      const baseUrl = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096"
      const client = createOpencodeClient({ baseUrl })
      const session = await client.session.create({ body: { title: "Speech input" } })
      await client.session.prompt({
        path: { id: session.data.id },
        body: { parts: [{ type: "text", text }] },
      })
    },
  }
}
