import { redis } from "@/lib/redis"

const main = async () => {
  // ? Fetch all messages
  const data = await redis.xrevrange("channel", "+", "-")

  // ? Fetch messages before a specific ID
  // const data = await redis.xrevrange("channel", "+", '1767030166862-0')
  console.log(data);
}

main()

//  npx tsx --env-file=.env redis101/xrevrange.ts