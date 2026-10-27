// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { joinTurns, transcribe } from "./transcribe";

const wav = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  process.env.MODEL_API_KEY = "test-key";
});

describe("transcribe", () => {
  it("transcribe posts multipart with request JSON and audio part", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-key");
      const form = init?.body as FormData;
      expect(JSON.parse(await (form.get("request") as Blob).text())).toEqual({
        model: "muse-voice-transcribe-1.0",
        audioEncoding: "WAV",
        mode: "DIARIZATION",
        keywords: ["eigenvalue"],
      });
      expect((form.get("request") as Blob).type).toBe("application/json");
      expect(form.get("audio")).toBeInstanceOf(Blob);
      return json({ transcript: "hi", turns: [{ turnId: 0, startMs: 1000, endMs: 2000, transcript: "hi" }] });
    });
    const turns = await transcribe(wav, { keywords: ["eigenvalue"], offset: 120, fetchImpl });
    expect(turns).toEqual([{ start: 121, end: 122, text: "hi" }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps the real ASR fixture", async () => {
    const body = JSON.parse(readFileSync(join(__dirname, "fixtures/asr.json"), "utf8"));
    const turns = await transcribe(wav, { keywords: [], offset: 0, fetchImpl: async () => json(body) });
    expect(turns.length).toBe(body.turns.length);
    expect(turns[0]).toEqual({ start: 0.06, end: 12.46, text: body.turns[0].transcript });
  });

  it("transcribe returns [] for an empty transcript", async () => {
    const turns = await transcribe(wav, { keywords: [], offset: 0, fetchImpl: async () => json({ transcript: "" }) });
    expect(turns).toEqual([]);
  });

  it("transcribe throws on non-2xx with the status in the message", async () => {
    await expect(
      transcribe(wav, { keywords: [], offset: 0, fetchImpl: async () => new Response("bad", { status: 400 }) }),
    ).rejects.toThrow(/400/);
  });
});

describe("meta", () => {
  it("throws without MODEL_API_KEY instead of caching a keyless client", async () => {
    vi.resetModules();
    delete process.env.MODEL_API_KEY;
    const fresh = (await import("./meta")).meta;
    expect(() => fresh()).toThrow(/MODEL_API_KEY/);
    process.env.MODEL_API_KEY = "later-key";
    expect(fresh().apiKey).toBe("later-key");
  });
});

describe("joinTurns", () => {
  it("joinTurns trims the overlap", () => {
    const a = [{ start: 100, end: 120, text: "a" }];
    const b = [
      { start: 117, end: 119.5, text: "dup" },
      { start: 121, end: 125, text: "b" },
    ];
    expect(joinTurns([a, b])).toEqual([a[0], b[1]]);
  });
});
