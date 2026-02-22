import { createOpencodeClient } from "@opencode-ai/sdk"

export const createSessionWithPrompt = async ({ baseUrl, prompt }) => {
  const client = createOpencodeClient({ baseUrl })
  const session = await client.session.create({ body: { title: "Speech input" } })
  await client.session.prompt({
    path: { id: session.data.id },
    body: {
      parts: [{ type: "text", text: prompt }],
    },
  })
  return session.data
}
