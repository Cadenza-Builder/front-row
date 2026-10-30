import { metaKey } from "./meta";

/** Seconds from lecture start. */
export type Turn = { start: number; end: number; text: string };

type AsrTurn = { startMs: number; endMs: number; transcript: string };

export async function transcribe(
  wav: Blob,
  opts: { keywords: string[]; offset: number; fetchImpl?: typeof fetch },
): Promise<Turn[]> {
  // Meta refuses the whole request over one keyword longer than 30 characters; compose still gets every keyword.
  const keywords = opts.keywords.filter((k) => k.length <= 30);
  const request = { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "DIARIZATION", keywords };
  let res: Response | undefined;
  // One retry on a network error, timeout or 5xx; a 4xx is our fault and fails at once.
  for (let attempt = 1; ; attempt++) {
    const form = new FormData(); // a sent body can't be reused
    form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
    form.append("audio", wav, "audio.wav");
    try {
      res = await (opts.fetchImpl ?? fetch)("https://api.meta.ai/v1/asr/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${metaKey()}`, Accept: "application/json" },
        body: form,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e) {
      if (attempt === 2) throw e;
      continue;
    }
    if (res.status < 500 || attempt === 2) break;
  }
  if (!res.ok) throw new Error(`transcribe failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { transcript?: string; turns?: AsrTurn[] };
  // Silence comes back with an empty transcript and no turns.
  if (!body.transcript) return [];
  return (body.turns ?? []).map((t) => ({
    start: t.startMs / 1000 + opts.offset,
    end: t.endMs / 1000 + opts.offset,
    text: t.transcript,
  }));
}

/** Segments overlap; drop turns of each segment that end at or before the previous segment's last turn. */
export function joinTurns(segments: Turn[][]): Turn[] {
  const out: Turn[] = [];
  for (const seg of segments) {
    const last = out.at(-1)?.end ?? -Infinity;
    out.push(...seg.filter((t) => t.end > last));
  }
  return out;
}
