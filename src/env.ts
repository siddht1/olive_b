import type { Model } from "./types"

/**
 * Used to create an .env.example file, do not fill in sensitive information directly.
 * Variables starting with CLIENT_ are exposed to the frontend
 */
export const defaultEnv = {
  CLIENT_GLOBAL_SETTINGS: {
    APIKey: "",
    password: "",
    enterToSend: true
  },
  CLIENT_SESSION_SETTINGS: {
    // 0-2
    title: "",
    saveSession: true,
    APITemperature: 0.6,
    continuousDialogue: true,
    APIModel: "gpt-3.5-turbo" as Model
  },
  CLIENT_DEFAULT_MESSAGE: `Powered by OpenAI Vercel
- Multiple conversations are now supported, open the conversation settings and click New conversation. Enter [[/]][[/]] or [[space]][[space]] in the input box to switch dialogues and search for historical messages.
- [[Shift]] + [[Enter]] Newline. Type [[/]] or [[space]] at the beginning to search for Prompt presets. [[↑]] Can edit the last question. Click the top name to scroll to the top, and click the input box to scroll to the bottom.
`,
  CLIENT_MAX_INPUT_TOKENS: {
    "gpt-3.5-turbo": 4 * 1024,
    "gpt-4": 8 * 1024,
    "gpt-4-32k": 32 * 1024
  } as Record<Model, number>,
  OPENAI_API_BASE_URL: "api.openai.com",
  OPENAI_API_KEY: "",
  TIMEOUT: 30000,
  PASSWORD: "",
  SEND_KEY: "",
  SEND_CHANNEL: 9,
  NO_GFW: false,
  user_info:req.headers
}

export type SessionSettings = typeof defaultEnv.CLIENT_SESSION_SETTINGS
