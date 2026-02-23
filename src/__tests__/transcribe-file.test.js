import { describe, it, expect, vi } from "vitest"
import { transcribeFile } from "../usecases/transcribe-file.js"
import { Transcript } from "../domain/transcript.js"

const createMockTranscriber = (text = "hello world") => ({
  transcribe: vi.fn().mockResolvedValue(new Transcript({ text, meta: { provider: "mock" } })),
})

describe("transcribeFile", () => {
  it("delegates to the transcriber and returns a Transcript", async () => {
    const transcriber = createMockTranscriber("the quick brown fox")

    const result = await transcribeFile({
      transcriber,
      filePath: "/tmp/audio.wav",
    })

    expect(transcriber.transcribe).toHaveBeenCalledWith("/tmp/audio.wav")
    expect(result).toBeInstanceOf(Transcript)
    expect(result.text).toBe("the quick brown fox")
  })

  it("returns empty Transcript for silence", async () => {
    const transcriber = createMockTranscriber("")

    const result = await transcribeFile({
      transcriber,
      filePath: "/tmp/silence.wav",
    })

    expect(result.isEmpty).toBe(true)
  })

  it("propagates transcriber errors", async () => {
    const transcriber = {
      transcribe: vi.fn().mockRejectedValue(new Error("model not found")),
    }

    await expect(
      transcribeFile({ transcriber, filePath: "/tmp/audio.wav" }),
    ).rejects.toThrow("model not found")
  })
})
