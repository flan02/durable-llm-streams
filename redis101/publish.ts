import { redis } from "@/lib/redis"

const main = async () => {
  await redis.publish("channel", { data: "my-data" })
}

main()

//  npx tsx --env-file=.env redis101/publish.ts