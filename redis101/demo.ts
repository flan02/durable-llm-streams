
import { redis } from "@/lib/redis"
// require('dotenv').config();
const sub = redis.subscribe("channel")

sub.on("subscribe", () => {
  console.log("subscribed");
})

sub.on("message", () => {
  console.log("received message");
})

//  npx tsx --env-file=.env redis101/demo.ts