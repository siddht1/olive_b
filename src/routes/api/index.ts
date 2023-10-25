import type { ParsedEvent, ReconnectInterval } from "eventsource-parser"
import { createParser } from "eventsource-parser"
import type { ChatMessage, Model } from "~/types"
import { splitKeys, randomKey, fetchWithTimeout } from "~/utils"
import { defaultEnv } from "~/env"
import type { APIEvent } from "solid-start/api"

export const config = {
  runtime: "edge",

  regions: [
    "arn1",
    "bom1",
    "bru1",
    "cdg1",
    "cle1",
    "cpt1a",
    "dub1",
    "fra1",
    "gru1",
    "hnd1",
    "iad1",
    "icn1",
    "kix1",
    "lhr1",
    "pdx1",
    "sfo1",
    "sin1",
    "syd1"
  ]
}

export const localKey = process.env.OPENAI_API_KEY || ""

export const baseURL =
  process.env.NO_GFW !== "false"
    ? defaultEnv.OPENAI_API_BASE_URL
    : (
        process.env.OPENAI_API_BASE_URL || defaultEnv.OPENAI_API_BASE_URL
      ).replace(/^https?:\/\//, "")


const timeout = isNaN(+process.env.TIMEOUT!)
  ? defaultEnv.TIMEOUT
  : +process.env.TIMEOUT!

const passwordSet = process.env.PASSWORD || defaultEnv.PASSWORD

export async function POST({ request }: APIEvent) {
  try {
    const body: {
      messages?: ChatMessage[]
      key?: string
      temperature: number
      password?: string
      model: Model
    } = await request.json()
    const { messages, key = localKey, temperature, password, model } = body
    console.log(messages,key)

    if (passwordSet && password !== passwordSet) {
      throw new Error("The password is incorrect, please contact the webmaster")
    }

    if (!messages?.length) {
      throw new Error("No text was entered")
    } else {
      const content = messages.at(-1)!.content.trim()
      if (content.startsWith("Check the balance of the filled key")) {
        if (key !== localKey) {
          const billings = await Promise.all(
            splitKeys(key).map(k => fetchBilling(k))
          )
          return new Response(await genBillingsTable(billings))
        } else {
          throw new Error("If the OpenAI API key is not filled in, the built-in key will not be queried.")
        }
      } else if (content.startsWith("sk-")) {
        const billings = await Promise.all(
          splitKeys(content).map(k => fetchBilling(k))
        )
        return new Response(await genBillingsTable(billings))
      }
    }

    const apiKey = randomKey(splitKeys(key))

    if (!apiKey) throw new Error("The OpenAI API key is not filled in, or the key is incorrect.")

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const rawRes = await fetchWithTimeout(
      `https://${baseURL}/v1/chat/completions`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        timeout,
        method: "POST",
        body: JSON.stringify({
          model: model,
          messages: messages.map(k => ({ role: k.role, content: k.content })),
          temperature,
          stream: true
        })
      }
    ).catch((err: { message: any }) => {
      return new Response(
        JSON.stringify({
          error: {
            message: err.message
          }
        }),
        { status: 500 }
      )
    })

    if (!rawRes.ok) {
      return new Response(rawRes.body, {
        status: rawRes.status,
        statusText: rawRes.statusText
      })
    }

    const stream = new ReadableStream({
      async start(controller) {
        const streamParser = (event: ParsedEvent | ReconnectInterval) => {
          if (event.type === "event") {
            const data = event.data
            if (data === "[DONE]") {
              controller.close()
              return
            }
            try {
              const json = JSON.parse(data)
              const text = json.choices[0].delta?.content
              const queue = encoder.encode(text)
              controller.enqueue(queue)
            } catch (e) {
              controller.error(e)
            }
          }
        }
        const parser = createParser(streamParser)
        for await (const chunk of rawRes.body as any) {
          parser.feed(decoder.decode(chunk))
        }
      }
    })

    return new Response(stream)
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: {
          message: err.message
        }
      }),
      { status: 400 }
    )
  }
}

type Billing = {
  key: string
  rate: number
  totalGranted: number
  totalUsed: number
  totalAvailable: number
}

export async function fetchBilling(key: string): Promise<Billing> {
  function formatDate(date: any) {
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const day = date.getDate().toString().padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  try {
    const now = new Date()
    const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    //  custom API url 
  
    const urlSubscription =
      "https://node-app-nine.vercel.app/v1/dashboard/billing/subscription"
    // Check whether to subscribe
    const urlUsage = `https://node-app-nine.vercel.app/v1/dashboard/billing/usage?start_date=${formatDate(
      startDate
    )}&end_date=${formatDate(endDate)}`
    
    //Check usage
    const headers = {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json"
    }

    // Get API quotas
    const subscriptionData = await fetch(urlSubscription, { headers }).then(r =>
      r.json()
    )
    if (subscriptionData.error?.message)
      throw new Error(subscriptionData.error.message)
    const totalGranted = subscriptionData.hard_limit_usd
    // Get the usage
    const usageData = await fetch(urlUsage, { headers }).then(r => r.json())
    const totalUsed = usageData.total_usage / 100
    // Calculate the remaining credit
    const totalAvailable = totalGranted - totalUsed
    return {
      totalGranted,
      totalUsed,
      totalAvailable,
      key,
      rate: totalAvailable / totalGranted
    }
  } catch (e) {
    console.error(e)
    return {
      key,
      rate: 0,
      totalGranted: 0,
      totalUsed: 0,
      totalAvailable: 0
    }
  }
}

export async function genBillingsTable(billings: Billing[]) {
  const table = billings
    .sort((m, n) => (m.totalGranted === 0 ? -1 : n.rate - m.rate))
    .map((k, i) => {
      if (k.totalGranted === 0)
        return `| ${k.key.slice(0, 8)} | not available| —— | —— |`
      return `| ${k.key.slice(0, 8)} | ${k.totalAvailable.toFixed(4)}(${(
        k.rate * 100
      ).toFixed(1)}%) | ${k.totalUsed.toFixed(4)} | ${k.totalGranted} |`
    })
    .join("\n")

  return `| Key  | Remaining | Used | Gross magnitude |
| ---- | ---- | ---- | ------ |
${table}
`
}
