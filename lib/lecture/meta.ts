import OpenAI from "openai";

/** The only place MODEL_API_KEY is read. Throws when unset so nothing caches a keyless client. */
export function metaKey(): string {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error("MODEL_API_KEY is not set");
  return key;
}

let client: OpenAI | undefined;

export function meta(): OpenAI {
  client ??= new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: metaKey() });
  return client;
}
