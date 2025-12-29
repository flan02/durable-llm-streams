import { redis } from "@/lib/redis"

const main = async () => {
  await redis.xadd("channel", "*", { my: "data" })
}

main()

//  npx tsx --env-file=.env redis101/xadd.ts