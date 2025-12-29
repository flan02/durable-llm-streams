/* eslint-disable @typescript-eslint/no-explicit-any */

import { openrouter } from "@/lib/openrouter"
import { realtime } from "@/lib/realtime"
import { redis } from "@/lib/redis"
import { serve } from "@upstash/workflow/nextjs"
import { convertToModelMessages, streamText, UIMessage } from "ai"

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return new Response('ID is required', { status: 400 })

  const channel = realtime.channel(id)

  const stream = new ReadableStream({
    start(controller) {
      console.log("--- [GET] Puente establecido. Escuchando ai.chunk...");

      // Usamos subscribe directamente (es lo que tus tipos permiten)
      (channel as any).subscribe((msg: any) => {
        if (msg.event === "ai.chunk") {
          console.log(`<<< [GET] Recibido: ${msg.data.type}`);
          controller.enqueue(`data: ${JSON.stringify(msg.data)}\n\n`);

          if (msg.data.type === "finish") {
            controller.close();
          }
        }
      });
    },
    cancel() {
      (channel as any).unsubscribe();
    }
  });


  //"X-Accel-Buffering": "no" // only ngrok
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  })
}


export const { POST } = serve(async (workflow) => {

  // console.log('CURRENT WORKFLOW', workflow);

  const payload = workflow.requestPayload as any
  const id = payload.id
  // const message = payload.message as UIMessage
  const lastMessage = payload.messages
    ? payload.messages[payload.messages.length - 1]
    : payload.message

  let messageText = "";
  if (lastMessage?.parts && Array.isArray(lastMessage.parts)) {
    messageText = lastMessage.parts.find((p: any) => p.type === "text")?.text || "";
  } else {
    messageText = lastMessage?.content || "";
  }


  const messageToSave = {
    id: lastMessage?.id || crypto.randomUUID(),
    role: lastMessage?.role || "user",
    parts: [{ type: "text" as const, text: messageText }]
  };

  if (!id || !messageText) {
    console.error("Mensaje vacío o ID faltante");
    throw new Error("Payload structure mismatch: messageText is empty");
  }
  // REPARACIÓN CRÍTICA: Convertir el objeto a STRING para Redis
  // Redis no acepta objetos JSON directamente, solo strings o números.
  await redis.zadd(
    `history:${id}`,
    { nx: true },
    { score: Date.now(), member: JSON.stringify(messageToSave) }
  )

  await workflow.run("ai-generation", async () => {
    // Obtenemos el historial y parseamos los strings de vuelta a objetos
    const historyRaw = await redis.zrange<string[]>(`history:${id}`, 0, -1)
    const history = historyRaw
      .map(item => {
        try {
          // Solo intentamos parsear si parece un JSON (empieza con {)
          return typeof item === 'string' && item.startsWith('{')
            ? JSON.parse(item) as UIMessage
            : null;
        } catch (e) {
          return null;
        }
      })
      .filter((msg): msg is UIMessage => msg !== null); // Eliminamos los nulos

    const result = streamText({
      model: openrouter.chat("deepseek/deepseek-r1-0528:free"), // * Ajustado a modelo real
      system: "Use markdown and headings 1-3 to nicely format your response. Use a few emojis.",
      messages: convertToModelMessages([...history, messageToSave]),
    })

    const stream = result.toUIMessageStream({
      generateMessageId: () => crypto.randomUUID(),
      onFinish: async ({ messages }) => {
        // Guardar el resultado final de la IA en el historial
        for (const msg of messages) {
          if (msg.role === 'assistant') {
            await redis.zadd(`history:${id}`, { score: Date.now(), member: JSON.stringify(msg) })
          }
        }
      }
    })

    const channel = realtime.channel(id) // Usamos el ID del chat para emitir

    for await (const chunk of stream) {
      console.log(`>>> [BACKEND] Emitiendo chunk a canal ${id}:`, chunk.type);
      await channel.emit("ai.chunk", chunk)
    }
  })
}, {
  baseUrl: process.env.UPSTASH_WORKFLOW_URL!,
})