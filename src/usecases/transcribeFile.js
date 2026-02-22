import { WhisperCppProvider } from "../adapters/whisperCppProvider.js"
import { OpenAIProvider } from "../adapters/openaiProvider.js"

export const transcribeFile = async ({ config, filePath }) => {
  const providerType = config.provider.type
  if (providerType === "whisper.cpp") {
    const provider = new WhisperCppProvider(config)
    return provider.transcribeFile(filePath)
  }

  if (providerType === "openai") {
    const provider = new OpenAIProvider(config)
    return provider.transcribeFile(filePath)
  }

  throw new Error(`Unsupported provider: ${providerType}`)
}
