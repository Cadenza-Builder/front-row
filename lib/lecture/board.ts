import type { ResponseInputImage } from "openai/resources/responses/responses";
import { z } from "zod";
import type { Box } from "./locate";
import { meta } from "./meta";
import type { Turn } from "./transcribe";

/** One sampled video frame, `t` seconds from lecture start, with what locate() found in it. */
export type Frame = { t: number; url: string; board: Box | null; person: Box | null; changed: boolean };
export type Snapshot = { t: number; url: string; board: Box; markdown: string; alt: string };

export const BoardReading = z.object({ markdown: z.string(), alt: z.string().max(200) });

const PROMPT = (b: Box, said: string) =>
  `The lecture board is the region x1=${b.x1};y1=${b.y1};x2=${b.x2};y2=${b.y2} (pixels) of this frame. ` +
  "Transcribe everything written on it as Markdown, in reading order. Write all math as LaTeX in $...$ " +
  "(inline) or $$...$$ (display). Ignore the people and anything outside the board. " +
  "The handwriting may be rushed: use what the professor said around this moment (below) to settle unclear symbols and words. " +
  "Write [unreadable] for anything you still cannot read; never guess. " +
  `In alt, describe the board for a screen reader in under 200 characters.\n\nSaid around this moment:\n${said || "(no speech)"}`;

/** `turns` are the segment's; only those within NEAR seconds of the frame go to the model. */
const NEAR = 30;

export async function readBoard(frame: Frame & { board: Box }, turns: Turn[]): Promise<Snapshot> {
  const said = turns
    .filter((t) => t.end >= frame.t - NEAR && t.start <= frame.t + NEAR)
    .map((t) => t.text)
    .join("\n");
  const res = await meta().responses.create({
    model: "muse-spark-1.3",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: PROMPT(frame.board, said) },
          // SDK types demand `detail`; the request verified live sent none.
          { type: "input_image", image_url: frame.url } as ResponseInputImage,
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
  });
  const { markdown, alt } = BoardReading.parse(JSON.parse(res.output_text));
  return { t: frame.t, url: frame.url, board: frame.board, markdown, alt };
}

/** Frames worth reading: every board frame that changed, plus the first one with a board when `keepFirst` (the lecture's first segment). */
export function pickSnapshots(frames: Frame[], keepFirst = true): (Frame & { board: Box })[] {
  const withBoard = frames.filter((f): f is Frame & { board: Box } => f.board !== null);
  return withBoard.filter((f, i) => (keepFirst && i === 0) || f.changed);
}
