/** Seconds from lecture start. */
export type Turn = { start: number; end: number; text: string };

type AsrTurn = { startMs: number; endMs: number; transcript: string };

export async function transcribe(
  wav: Blob,
  opts: { keywords: string[]; offset: number; fetchImpl?: typeof fetch },
): Promise<Turn[]> {
  const form = new FormData();
  const request = { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "DIARIZATION", keywords: opts.keywords };
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", wav, "audio.wav");
  const res = await (opts.fetchImpl ?? fetch)("https://api.meta.ai/v1/asr/transcribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, Accept: "application/json" },
    body: form,
  });
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
