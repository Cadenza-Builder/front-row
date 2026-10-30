import type { ResponseInputImage } from "openai/resources/responses/responses";
import sharp from "sharp";
import { z } from "zod";
import type { Box } from "./locate";
import { meta } from "./meta";
import type { Turn } from "./transcribe";

/** One sampled video frame, `t` seconds from lecture start, with what locate() found in it. */
export type Frame = { t: number; url: string; board: Box | null; person: Box | null; changed: boolean };
export type Snapshot = { t: number; url: string; board: Box; markdown: string; alt: string };

export const BoardReading = z.object({ markdown: z.string(), alt: z.string().max(200) });

const PROMPT = (said: string) =>
  "This image is a lecture board. Transcribe everything written on it as Markdown, in reading order. Write all math as LaTeX in $...$ " +
  "(inline) or $$...$$ (display). Ignore the people and anything outside the board. " +
  "The handwriting may be rushed: use what the professor said around this moment (below) to settle unclear symbols and words. " +
  "Write [unreadable] for anything you still cannot read; never guess. " +
  `In alt, describe the board for a screen reader in under 200 characters.\n\nSaid around this moment:\n${said || "(no speech)"}`;

/** `box` (in `box.w × box.h` pixels) scaled onto a `width × height` image, padded by `margin` of its size, clamped to the image. */
export function cropRect(box: Box, width: number, height: number, margin = 0.05) {
  const sx = width / box.w;
  const sy = height / box.h;
  const padX = (box.x2 - box.x1) * sx * margin;
  const padY = (box.y2 - box.y1) * sy * margin;
  const left = Math.max(0, Math.round(box.x1 * sx - padX));
  const top = Math.max(0, Math.round(box.y1 * sy - padY));
  const right = Math.min(width, Math.round(box.x2 * sx + padX));
  const bottom = Math.min(height, Math.round(box.y2 * sy + padY));
  return { left, top, width: right - left, height: bottom - top };
}

/** The frame cropped to its board, as a data: URL. Throws on a failed fetch or crop, so the caller skips the frame. */
async function cropBoard(url: string, box: Box): Promise<string> {
  let buf: Buffer;
  if (url.startsWith("data:")) buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  else {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`frame fetch ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const { width, height } = await sharp(buf).metadata();
  const jpeg = await sharp(buf).extract(cropRect(box, width, height)).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** `turns` are the segment's; only those within NEAR seconds of the frame go to the model. */
const NEAR = 30;

export async function readBoard(frame: Frame & { board: Box }, turns: Turn[]): Promise<Snapshot> {
  const said = turns
    .filter((t) => t.end >= frame.t - NEAR && t.start <= frame.t + NEAR)
    .map((t) => t.text)
    .join("\n");
  const image = await cropBoard(frame.url, frame.board);
  const res = await meta().responses.create({
    model: "muse-spark-1.3",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: PROMPT(said) },
          // SDK types demand `detail`; the request verified live sent none.
          { type: "input_image", image_url: image } as ResponseInputImage,
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "board_reading",
        strict: true,
        // Strict mode rejects maxLength (lib/openai/client.ts), so the 200 cap is enforced by the parse below.
        schema: z.toJSONSchema(BoardReading.extend({ alt: z.string() }), { target: "draft-7" }) as Record<string, unknown>,
      },
    },
    // One retry, because single 45 s stalls lost reads on the live run.
  }, { maxRetries: 1 });
  const { markdown, alt } = BoardReading.parse(JSON.parse(res.output_text));
  return { t: frame.t, url: frame.url, board: frame.board, markdown, alt };
}

/**
 * Frames worth reading: from each run of changed frames, the last one with a board, read once the run ends (the next frame,
 * board or not, is unchanged, or there is none); plus the first one with a board when `keepFirst` (the lecture's first segment).
 * `frames` must be in time order.
 */
export function pickSnapshots(frames: Frame[], keepFirst = true): (Frame & { board: Box })[] {
  const settled = new Set<Frame>();
  let last: Frame | null = null; // last frame with a board in the current run of changed frames
  frames.forEach((f, i) => {
    if (!f.changed) return;
    if (f.board) last = f;
    if (i === frames.length - 1 || !frames[i + 1].changed) {
      if (last) settled.add(last);
      last = null;
    }
  });
  const withBoard = frames.filter((f): f is Frame & { board: Box } => f.board !== null);
  return withBoard.filter((f, i) => (keepFirst && i === 0) || settled.has(f));
}

/** The 6-character pieces of a read, ignoring `[unreadable]`, whitespace and case. */
const pieces = (md: string) => {
  const s = md.replaceAll("[unreadable]", "").replace(/\s+/g, "").toLowerCase();
  return new Set(Array.from({ length: Math.max(0, s.length - 5) }, (_, i) => s.slice(i, i + 6)));
};

/** `a` adds at most 10 pieces to `b`. */
const within = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const p of a) if (!b.has(p) && ++n > 10) return false;
  return true;
};

/** Time-ordered reads minus repeats: empty reads go, a read that adds nothing to a kept one goes, and a fuller later read replaces the kept ones it covers. */
export function dedupeSnaps(snaps: Snapshot[]): Snapshot[] {
  let kept: { snap: Snapshot; p: Set<string> }[] = [];
  for (const snap of snaps) {
    const p = pieces(snap.markdown);
    if (p.size === 0 || kept.some((k) => within(p, k.p))) continue;
    kept = kept.filter((k) => !within(k.p, p));
    kept.push({ snap, p });
  }
  return kept.map((k) => k.snap);
}
