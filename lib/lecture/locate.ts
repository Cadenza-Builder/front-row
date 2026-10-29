import type { ResponseInputImage } from "openai/resources/responses/responses";
import { meta } from "./meta";

/** Pixel corners in a w×h frame, as SAM 3.1 reports them. */
export type Box = { x1: number; y1: number; x2: number; y2: number; w: number; h: number };

// SAM 3.1 takes one noun phrase: the combined list found nothing on a real chalkboard (2026-10-28), so each is asked.
const BOARDS = ["blackboard", "whiteboard", "projector screen"];

/** Every `<|box;...|>` in a SAM output stream; masks ignored. */
export function parseSam(text: string): Box[] {
  return [...text.matchAll(/<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>/g)].map(
    ([, x1, y1, x2, y2, w, h]) => ({ x1: +x1, y1: +y1, x2: +x2, y2: +y2, w: +w, h: +h }),
  );
}

/** The person standing at the board: vertical centre inside the board's span, horizontally closest to it. Students sit below. */
export function pickProfessor(people: Box[], board: Box): Box | null {
  let best: Box | null = null;
  let bestGap = Infinity;
  for (const p of people) {
    const cy = (p.y1 + p.y2) / 2;
    if (cy < board.y1 || cy > board.y2) continue;
    const gap = Math.max(0, board.x1 - p.x2, p.x1 - board.x2);
    if (gap < bestGap) [best, bestGap] = [p, gap];
  }
  return best;
}

async function sam(text: string, frameUrl: string): Promise<Box[]> {
  const res = await meta().responses.create({
    model: "sam-3.1",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text },
          // SDK types demand `detail`; the request verified live sent none.
          { type: "input_image", image_url: frameUrl } as ResponseInputImage,
        ],
      },
    ],
  });
  return parseSam(res.output_text ?? "");
}

export async function locate(frameUrl: string): Promise<{ board: Box | null; person: Box | null }> {
  const [people, ...found] = await Promise.all([sam("person", frameUrl), ...BOARDS.map((b) => sam(b, frameUrl))]);
  const boards = found.flat();
  const area = (b: Box) => (b.x2 - b.x1) * (b.y2 - b.y1);
  const board = boards.reduce<Box | null>((a, b) => (a && area(a) >= area(b) ? a : b), null);
  return { board, person: board && pickProfessor(people, board) };
}
