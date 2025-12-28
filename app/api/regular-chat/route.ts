import { openrouter } from "@/lib/openrouter"
import { convertToModelMessages, streamText } from "ai"

export const POST = async (req: Request) => {
  const { messages } = await req.json()

  const result = streamText({
    model: openrouter.chat("google/gemini-2.5-flash-lite"),
    system: "Use markdown and headings 1-3 to nicely format your response. User a few emojis.",
    messages: convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}