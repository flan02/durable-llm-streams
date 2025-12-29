

import { openrouter } from "@/lib/openrouter"
import { realtime } from "@/lib/realtime"
import { redis } from "@/lib/redis"
import { serve } from "@upstash/workflow/nextjs"
import { convertToModelMessages, streamText, UIMessage } from "ai"

export const dynamic = 'force-dynamic';

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return new Response('ID is required', { status: 400 })

  const channel = realtime.channel(id)

  // const stream = new ReadableStream({
  //   start(controller) {
  //     console.log("--- [GET] Puente establecido. Escuchando ai.chunk...");

  //     const preamble = `: ${" ".repeat(2048)}\n\n`;
  //     controller.enqueue(new TextEncoder().encode(preamble));

  //    // Usamos subscribe directamente (es lo que tus tipos permiten)
  //         (channel as any).subscribe((msg: any) => {
  //           if (msg.event === "ai.chunk") {
  //             console.log(`<<< [GET] Recibido: ${msg.data.type}`);

  //             controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(msg.data)}\n\n`));
  //             // controller.enqueue(`data: ${JSON.stringify(msg.data)}\n\n`);

  //             if (msg.data.type === "finish") {
  //               controller.close();
  //             }
  //           }
  //         });
  //       },
  //       cancel() {
  //         (channel as any).unsubscribe();
  //       }

  //     })

  const stream = new ReadableStream({
    async start(controller) {
      await channel.history().on("ai.chunk", (chunk) => {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
        if (chunk.type === "finish") controller.close()
      })
    },
  })


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
      system:
        "Use markdown and headings 1-3 to nicely format your response. Use a few emojis.",
      messages: convertToModelMessages([...history, message]),
    })

    const stream = result.toUIMessageStream({
      generateMessageId: () => crypto.randomUUID(),
      onFinish: async ({ messages }) => {
        for (const member of messages) {
          await redis.zadd(`history:${id}`, { score: Date.now(), member })
        }
      },
    })

    const channel = realtime.channel(message.id)

    for await (const chunk of stream) {
      await channel.emit("ai.chunk", chunk)
    }
  })
})


// export const { POST } = serve(async (workflow) => {

//   // console.log('CURRENT WORKFLOW', workflow);

//   const payload = workflow.requestPayload as any
//   const id = payload.id
//   // const message = payload.message as UIMessage
//   const lastMessage = payload.messages
//     ? payload.messages[payload.messages.length - 1]
//     : payload.message

//   let messageText = "";
//   if (lastMessage?.parts && Array.isArray(lastMessage.parts)) {
//     messageText = lastMessage.parts.find((p: any) => p.type === "text")?.text || "";
//   } else {
//     messageText = lastMessage?.content || "";
//   }


//   const messageToSave = {
//     id: lastMessage?.id || crypto.randomUUID(),
//     role: lastMessage?.role || "user",
//     parts: [{ type: "text" as const, text: messageText }]
//   };

//   if (!id || !messageText) {
//     console.error("Mensaje vacío o ID faltante");
//     throw new Error("Payload structure mismatch: messageText is empty");
//   }
//   // REPARACIÓN CRÍTICA: Convertir el objeto a STRING para Redis
//   // Redis no acepta objetos JSON directamente, solo strings o números.
//   await redis.zadd(
//     `history:${id}`,
//     { nx: true },
//     { score: Date.now(), member: JSON.stringify(messageToSave) }
//   )

//   await workflow.run("ai-generation", async () => {
//     // Obtenemos el historial y parseamos los strings de vuelta a objetos
//     const historyRaw = await redis.zrange<string[]>(`history:${id}`, 0, -1)
//     const history = historyRaw
//       .map(item => {
//         try {
//           // Solo intentamos parsear si parece un JSON (empieza con {)
//           return typeof item === 'string' && item.startsWith('{')
//             ? JSON.parse(item) as UIMessage
//             : null;
//         } catch (e) {
//           return null;
//         }
//       })
//       .filter((msg): msg is UIMessage => msg !== null); // Eliminamos los nulos

//     const result = streamText({
//       model: openrouter.chat("qwen/qwen3-coder:free"), // * Ajustado a modelo real  // deepseek/deepseek-r1-0528:free
//       system: "Use markdown and headings 1-3 to nicely format your response. Use a few emojis.",
//       messages: convertToModelMessages([...history, messageToSave]),
//     })

//     const stream = result.toUIMessageStream({
//       generateMessageId: () => crypto.randomUUID(),
//       onFinish: async ({ messages }) => {
//         // Guardar el resultado final de la IA en el historial
//         for (const msg of messages) {
//           if (msg.role === 'assistant') {
//             await redis.zadd(`history:${id}`, { score: Date.now(), member: JSON.stringify(msg) })
//           }
//         }
//       }
//     })

//     const channel = realtime.channel(id) // Usamos el ID del chat para emitir

//     for await (const chunk of stream) {
//       console.log(`>>> [BACKEND] Emitiendo chunk a canal ${id}:`, chunk.type);
//       await channel.emit("ai.chunk", chunk)
//     }
//   })
// }, {
//   baseUrl: process.env.UPSTASH_WORKFLOW_URL!
// })