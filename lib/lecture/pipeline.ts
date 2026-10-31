import { dedupeSnaps, pickSnapshots, readBoard, type Frame, type Snapshot } from "./board";
import { compose, toMarkdown } from "./compose";
import { link } from "./link";
import { locate, type BoardKind } from "./locate";
import { joinTurns, transcribe, type Turn } from "./transcribe";

type Segment = { turns: Turn[]; frames: Frame[]; snaps: Snapshot[] };

/** One recorded segment: transcribe, find board and professor in each frame, read the boards worth reading. */
export async function processSegment(input: {
  wav: Blob;
  offset: number;
  frames: { t: number; url: string; changed: boolean }[];
  keywords: string[];
}): Promise<Segment> {
  // The model fetches these URLs; only signed https or inline images.
  for (const f of input.frames) if (!/^(https:|data:image\/)/.test(f.url)) throw new Error(`frame ${f.t}: url must be https or data:image`);
  // One bad frame never fails the lecture: a failed locate is no board, a failed board read is no snapshot.
  const none = { board: null, person: null, kind: null };
  const find = (f: { t: number; url: string }, kind?: BoardKind) => locate(f.url, kind).catch((e) => warn(f.t, "locate", e, none));
  const picked = framesToLocate(input.frames);
  const [first, ...rest] = input.frames.filter((f) => picked.has(f.t));
  const found = new Map<number, Awaited<ReturnType<typeof find>>>();
  const locateAll = async () => {
    if (!first) return;
    const head = await find(first);
    found.set(first.t, head);
    const kind = head.kind ?? undefined;
    (await Promise.all(rest.map((f) => find(f, kind)))).forEach((r, i) => found.set(rest[i].t, r));
  };
  // In parallel so a segment fits the 300 s function: max(transcribe 90 s, locate 135 s) + reads 45 s. A failed transcript still fails the segment.
  const [turns] = await Promise.all([transcribe(input.wav, { keywords: input.keywords, offset: input.offset }), locateAll()]);
  // A frame not located keeps the boxes of the last located frame before it.
  let last: Awaited<ReturnType<typeof find>> = none;
  const frames: Frame[] = input.frames.map((f) => {
    last = found.get(f.t) ?? last;
    return { ...f, board: last.board, person: last.person };
  });
  const read = await Promise.all(pickSnapshots(frames, input.offset === 0).map((f) => readBoard(f, turns).catch((e) => warn(f.t, "readBoard", e, null))));
  return { turns, frames, snaps: read.filter((s) => s !== null) };
}

/** The `t`s worth a SAM call: changed frames, the first, and one at least every 60 s so the professor's position stays fresh. */
export function framesToLocate(frames: { t: number; changed: boolean }[]): Set<number> {
  const picked = new Set<number>();
  let last = -Infinity;
  for (const f of frames) if (f.changed || !picked.size || f.t - last >= 60) picked.add((last = f.t));
  return picked;
}

function warn<T>(t: number, step: string, e: unknown, fallback: T): T {
  console.warn(`lecture: ${step} failed on frame ${t}s, skipped:`, e instanceof Error ? e.message : e);
  return fallback;
}

/** All segments of a lecture into notes. `link` needs time order, so frames and snapshots are sorted; repeated board reads are dropped first. */
export async function finishLecture(segments: Segment[], course: string, keywords: string[]) {
  const byTime = (a: { t: number }, b: { t: number }) => a.t - b.t;
  const turns = joinTurns(segments.map((s) => s.turns));
  const frames = segments.flatMap((s) => s.frames).sort(byTime);
  const snaps = dedupeSnaps(segments.flatMap((s) => s.snaps).sort(byTime));
  const { notes, usage } = await compose({ turns: link(turns, frames, snaps), snaps, course, keywords });
  return { notes, snaps, markdown: toMarkdown(notes), usage };
}
