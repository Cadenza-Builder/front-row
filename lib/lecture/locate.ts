import type { ResponseInputImage } from "openai/resources/responses/responses";
import { meta } from "./meta";

/** Pixel corners in a w×h frame, as SAM 3.1 reports them. */
export type Box = { x1: number; y1: number; x2: number; y2: number; w: number; h: number };

// SAM 3.1 takes one noun phrase: the combined list found nothing on a real chalkboard (2026-10-28), so each is asked.
export type BoardKind = "blackboard" | "whiteboard" | "projector screen";
const BOARDS: BoardKind[] = ["blackboard", "whiteboard", "projector screen"];

/** Every `<|box;...|>` in a SAM output stream; masks ignored. */
export function parseSam(text: string): Box[] {
  return [...text.matchAll(/<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>/g)].map(
    ([, x1, y1, x2, y2, w, h]) => ({ x1: +x1, y1: +y1, x2: +x2, y2: +y2, w: +w, h: +h }),
  );
}

/** Horizontal distance from a person to a board; 0 when they overlap. */
const gap = (p: Box, board: Box) => Math.max(0, board.x1 - p.x2, p.x1 - board.x2);
const area = (b: Box) => (b.x2 - b.x1) * (b.y2 - b.y1);

/** The person standing at the board: vertical centre inside the board's span, horizontally closest to it. Students sit below. */
export function pickProfessor(people: Box[], board: Box): Box | null {
  let best: Box | null = null;
  let bestGap = Infinity;
  for (const p of people) {
    const cy = (p.y1 + p.y2) / 2;
    if (cy < board.y1 || cy > board.y2) continue;
    const g = gap(p, board);
    if (g < bestGap) [best, bestGap] = [p, g];
  }
  return best;
}

/** The board the professor is nearest to, larger on a tie; with nobody at any board, the largest. */
export function pickBoard(boards: Box[], people: Box[]): { board: Box; person: Box | null } | null {
  let best: { board: Box; person: Box | null; g: number } | null = null;
  for (const board of boards) {
    const person = pickProfessor(people, board);
    const g = person ? gap(person, board) : Infinity;
    if (!best || g < best.g || (g === best.g && area(board) > area(best.board))) best = { board, person, g };
  }
  return best && { board: best.board, person: best.person };
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

/** With `kind` (the phrase that matched earlier), asks only person and that phrase; the other two only if it finds nothing. */
export async function locate(frameUrl: string, kind?: BoardKind): Promise<{ board: Box | null; person: Box | null; kind: BoardKind | null }> {
  const kindOf = new Map<Box, BoardKind>();
  const ask = (kinds: BoardKind[]) => Promise.all(kinds.map(async (k) => (await sam(k, frameUrl)).forEach((b) => kindOf.set(b, k))));
  const [people] = await Promise.all([sam("person", frameUrl), ask(kind ? [kind] : BOARDS)]);
  if (kind && !kindOf.size) await ask(BOARDS.filter((b) => b !== kind));
  const pick = pickBoard([...kindOf.keys()], people);
  return pick ? { ...pick, kind: kindOf.get(pick.board)! } : { board: null, person: null, kind: null };
}
