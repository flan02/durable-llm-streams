# El reto de Pub/Sub con Upstash y Vercel (Serverless)

Aquí hay un detalle técnico crítico que debes saber para 2025:

El Pub/Sub tradicional de Redis requiere una conexión TCP abierta y persistente (porque el suscriptor debe estar "colgado del teléfono" esperando el mensaje). Como mencionamos antes, las funciones de Vercel son efímeras y se cierran rápido.

¿Cómo se soluciona en Upstash? Upstash introdujo algo llamado Upstash QStash y soporte para Webhooks en su Redis.

En lugar de mantener una conexión abierta, Upstash recibe el mensaje y hace un HTTP POST a tu API de Vercel cuando hay novedades.

Esto permite tener arquitectura de eventos (Pub/Sub) en un entorno donde no puedes tener conexiones permanentes

## ¿Cuándo dar el salto?

Deberías migrar a esta arquitectura si tu proyecto requiere:

Interactividad: Varias personas editando lo mismo o viendo cambios de otros al instante.

Procesos en segundo plano: El usuario sube una imagen, tú le respondes "Recibido" (HTTP 200) y por detrás, mediante Pub/Sub, avisas a otro proceso para que la redimensione.

Microservicios: Si tu app crece y quieres que diferentes partes se comuniquen sin estar "pegadas" entre sí
