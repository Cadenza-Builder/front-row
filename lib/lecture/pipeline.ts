import { pickSnapshots, readBoard, type Frame, type Snapshot } from "./board";
import { compose, toMarkdown } from "./compose";
import { link } from "./link";
import { locate } from "./locate";
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
  const turns = await transcribe(input.wav, { keywords: input.keywords, offset: input.offset });
  // One bad frame never fails the lecture: a failed locate is no board, a failed board read is no snapshot.
  const frames: Frame[] = await Promise.all(
    input.frames.map(async (f) => ({ ...f, ...(await locate(f.url).catch((e) => warn(f.t, "locate", e, { board: null, person: null }))) })),
  );
  const read = await Promise.all(pickSnapshots(frames, input.offset === 0).map((f) => readBoard(f, turns).catch((e) => warn(f.t, "readBoard", e, null))));
  return { turns, frames, snaps: read.filter((s) => s !== null) };
}

function warn<T>(t: number, step: string, e: unknown, fallback: T): T {
  console.warn(`lecture: ${step} failed on frame ${t}s, skipped:`, e instanceof Error ? e.message : e);
  return fallback;
}

/** All segments of a lecture into notes. `link` needs time order, so frames and snapshots are sorted. */
export async function finishLecture(
  segments: Segment[],
  course: string,
  keywords: string[],
) {
  const byTime = (a: { t: number }, b: { t: number }) => a.t - b.t;
  const turns = joinTurns(segments.map((s) => s.turns));
  const frames = segments.flatMap((s) => s.frames).sort(byTime);
  const snaps = segments.flatMap((s) => s.snaps).sort(byTime);
  const { notes, usage } = await compose({ turns: link(turns, frames, snaps), snaps, course, keywords });
  return { notes, snaps, markdown: toMarkdown(notes, snaps), usage };
}
