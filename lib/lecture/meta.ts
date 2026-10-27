import OpenAI from "openai";

let client: OpenAI | undefined;

export function meta(): OpenAI {
  client ??= new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY });
  return client;
}
