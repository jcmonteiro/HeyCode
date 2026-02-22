import { execa } from "execa"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { fileURLToPath } from "node:url"
import path from "node:path"


const commandPrefix = "/speech"

export const SpeechPlugin = async ({ client }) => {
  const scriptPath = fileURLToPath(
    new URL("../../bin/speechctl.js", import.meta.url),
  )
  return {
    "server.connected": async () => {
      await client.tui.showToast({
        body: { message: "Speech plugin loaded", variant: "success" },
      })
    },
    "tui.command.execute": async (input) => {
      if (!input.command?.startsWith(commandPrefix)) return

      const args = input.command.replace(commandPrefix, "").trim()

      if (args) {
        const { stdout } = await execa(
          process.execPath,
          [scriptPath, "transcribe", args],
          {
            cwd: path.dirname(scriptPath),
          },
        )
        const text = stdout.trim()
        if (!text) {
          throw new Error("No transcription produced")
        }
        const baseUrl = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096"
        const client = createOpencodeClient({ baseUrl })
        await client.tui.appendPrompt({ body: { text } })
        return
      }

      const statusCheck = await execa(
        process.execPath,
        [scriptPath, "record", "--status"],
        { cwd: path.dirname(scriptPath) },
      )
      const statusOutput = statusCheck.stdout.trim()
      const isRecording = statusOutput.startsWith("recording:")

      if (!isRecording) {
        const { stdout } = await execa(
          process.execPath,
          [scriptPath, "record"],
          { cwd: path.dirname(scriptPath) },
        )
        const output = stdout.trim()
        if (!output.startsWith("recording:")) {
          throw new Error("Failed to start recording")
        }
        const baseUrl = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096"
        const client = createOpencodeClient({ baseUrl })
        await client.tui.showToast({
          body: { message: "Recording started", variant: "success" },
        })
        return
      }

      const { stdout: stopStdout } = await execa(
        process.execPath,
        [scriptPath, "record"],
        { cwd: path.dirname(scriptPath) },
      )
      const stopOutput = stopStdout.trim()
      if (!stopOutput.startsWith("stopped:")) {
        throw new Error("Failed to stop recording")
      }

      const outputPath = stopOutput.replace("stopped:", "").trim()
      const { stdout } = await execa(
        process.execPath,
        [scriptPath, "transcribe", outputPath],
        { cwd: path.dirname(scriptPath) },
      )
      const text = stdout.trim()
      if (!text) {
        throw new Error("No transcription produced")
      }

      const baseUrl = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096"
      const client = createOpencodeClient({ baseUrl })
      await client.tui.appendPrompt({ body: { text } })
    },
  }
}
