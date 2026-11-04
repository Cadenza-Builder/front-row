// The recorder's pure parts: audio to 16 kHz mono WAV, which segments still need uploading, and creating the lecture.

/** 16-bit mono PCM RIFF. Samples are clamped to [-1, 1]. */
export function encodeWav(pcm: Float32Array, rate: number): Blob {
  const v = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => {
    const s = Math.max(-1, Math.min(1, x));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  });
  return new Blob([v.buffer], { type: "audio/wav" });
}

/** Averages each run of input samples into one output sample (a box filter, enough for speech). */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio), b = Math.floor((i + 1) * ratio);
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / (b - a);
  }
  return out;
}

/** Segment numbers 0..total-1 not in `uploaded`. */
export function missingSegments(uploaded: number[], total: number): number[] {
  const done = new Set(uploaded);
  return Array.from({ length: total }, (_, n) => n).filter((n) => !done.has(n));
}

/** Creates the lecture. A 409 means this student never agreed to the recording rule: ask once, then retry with consent. Null when they decline. */
export async function startLecture(lectureCourseId: string, askConsent: () => Promise<boolean>): Promise<{ id: string; number: number } | null> {
  const post = (consent?: true) =>
    fetch("/api/lectures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lectureCourseId, source: "phone", consent }) });
  let res = await post();
  if (res.status === 409) {
    if (!(await askConsent())) return null;
    res = await post(true);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
  return { id: body.id, number: body.number };
}

export type Box = { x: number; y: number; w: number; h: number };

/** The share of `b` that `a` covers. */
export function overlap(a: Box, b: Box) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (x * y) / (b.w * b.h);
}
