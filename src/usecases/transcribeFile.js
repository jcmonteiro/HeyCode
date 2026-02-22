import { WhisperCppProvider } from "../adapters/whisperCppProvider.js"

export const transcribeFile = async ({ config, filePath }) => {
  const providerType = config.provider.type
  if (providerType !== "whisper.cpp") {
    throw new Error(`Unsupported provider: ${providerType}`)
  }

  const provider = new WhisperCppProvider(config)
  return provider.transcribeFile(filePath)
}
