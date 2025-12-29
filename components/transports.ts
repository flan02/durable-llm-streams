/* eslint-disable @typescript-eslint/no-explicit-any */
import { DefaultChatTransport } from "ai";

type ResumableTransportOptions = {
  messageId: string | null
  setChatId: (id: string | null) => any
  setMessageId: (id: string | null) => any
}

export const createResumableTransport = ({ messageId, setChatId, setMessageId }: ResumableTransportOptions) => {
  return new DefaultChatTransport({
    async prepareSendMessagesRequest({ messages, id }) {
      await setChatId(id)
      return { body: { message: messages[messages.length - 1], id } }
    },
    prepareReconnectToStreamRequest: (data) => {
      return {
        ...data,
        headers: {
          ...data.headers, "x-is-reconnect": "true"
        }
      }
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)

      if (headers.get("x-is-reconnect") === "true") {
        console.log("🔍 [DEBUG] Reconnect detectado. Usando messageId:", messageId);
        return fetch(input + `?id=${messageId}`, {
          ...init,
          method: "GET",
        })
      }

      const body = JSON.parse(init?.body as string);
      const chatId = body.id;
      const currentMessageId = body.message.id;

      console.log("🚀 [DEBUG] Nueva petición iniciada:");
      console.log("   👉 ID del Canal (chatId):", chatId);
      console.log("   👉 ID del Mensaje (currentMessageId):", currentMessageId);
      await setMessageId(currentMessageId)
      // const { id } = JSON.parse(init?.body as string).message
      // await setMessageId(id)

      // * With Promise.all
      // const [res] = await Promise.all([
      //   fetch(input + `?id=${chatId}`, { method: "GET", headers: { "Accept": "text/event-stream" } }),
      //   fetch(input, init)
      // ])

      // * Without Promise.all
      fetch(input, init).catch(err => console.error("Error en POST:", err))

      const streamUrl = input + `?id=${chatId}`;
      console.log("📡 [DEBUG] Abriendo EventStream en:", streamUrl);

      return fetch(input + `?id=${chatId}`, {
        method: "GET",
        headers: {
          "Accept": "text/event-stream",
          "Cache-Control": "no-cache"
        }
      });

      // const res = await fetch(input + `?id=${chatId}`, {
      //   method: "GET",
      //   headers: {
      //     "Accept": "text/event-stream",
      //     "Cache-Control": "no-cache"
      //   }
      // });


      // return res
    }
  })
}

export const createRegularTransport = () => {
  return new DefaultChatTransport({ api: "/api/regular-chat" })
}