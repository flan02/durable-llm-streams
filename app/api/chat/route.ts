import { openrouter } from "@/lib/openrouter"
import { realtime } from "@/lib/realtime"
import { redis } from "@/lib/redis"
import { serve } from "@upstash/workflow/nextjs"
import { convertToModelMessages, streamText, UIMessage } from "ai"

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url)

  const id = searchParams.get("id")
  if (!id) return new Response('ID is required')

  const channel = realtime.channel(id)

  const stream = new ReadableStream({
    async start(controller) {
      await channel.history().on("ai.chunk", (chunk) => {
        controller.enqueue(`data; ${JSON.stringify(chunk)}\n\n`)
        if (chunk.type === "finish") controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" }
  })
}


export const { POST } = serve(async (workflow) => {
  const score = Date.now()
  const { id, message } = workflow.requestPayload as {
    id: string
    message: UIMessage
  }

  await redis.zadd(`history:${id}`, { nx: true }, { score, member: message })
  await workflow.run("ai-generation", async () => {
    const history = await redis.zrange<UIMessage[]>(`history:${id}`, 0, -1)

    const result = streamText({
      model: openrouter.chat("google/gemini-2.5-flash-lite"),
      system: "Use markdown and headings 1-3 to nicely format your response. User a few emojis.",
      messages: convertToModelMessages([...history, message]),
    })

    const stream = result.toUIMessageStream({
      generateMessageId: () => crypto.randomUUID(),
      onFinish: async ({ messages }) => {
        for (const member of messages) {
          await redis.zadd(`history:${id}`, { score: Date.now(), member })
        }
      }
    })

    const channel = realtime.channel(message.id)

    for await (const chunk of stream) {
      await channel.emit("ai.chunk", chunk)
    }
  })
})