import type { Frame, Snapshot } from "@/lib/lecture/board";
import type { Turn } from "@/lib/lecture/transcribe";

export type SegRow = { n: number; status: "uploaded" | "done" | "failed" | null; result: unknown };
type Done = { turns: Turn[]; frames: Frame[]; snaps: Snapshot[] };
/** A board photo the phone kept: `name` is its file in the lecture's folder; `snap` once the board is read. */
export type Photo = { name: string; t: number; snap: Snapshot | null };

/**
 * What the Wait screen shows, from the lecture row and its segments as the browser polls them. Each segment is heard
 * and its board photos read on the server as it uploads; `finish` does the ones left, then writes the notes.
 * Bars: 0 saving the last part, 1 hearing, 2 reading the board, 3 writing (half once every part is in).
 */
export function progress(lecture: { status: string; segment_count: number }, rows: SegRow[]) {
  const segs = [...rows].sort((a, b) => a.n - b.n);
  const done = segs.filter((s) => s.status === "done");
  const total = Math.max(lecture.segment_count, segs.length);
  const photos = segs.flatMap((s): Photo[] => {
    if (s.status === "done") return (s.result as Done).snaps.map((snap) => ({ name: snap.url, t: snap.t, snap }));
    // Not heard yet: the frames the phone kept, still to be read.
    const frames = (s.result as { frames?: { t: number; changed: boolean }[] } | null)?.frames ?? [];
    return frames.filter((f) => f.changed).map((f) => ({ name: `${s.n}-${f.t}.jpg`, t: f.t, snap: null }));
  });
  const read = photos.filter((p) => p.snap).length;
  const ready = lecture.status === "ready";
  const heard = total ? done.length / total : 0;
  return {
    steps: [lecture.status === "recording" ? 0.5 : 1, ready ? 1 : heard, ready ? 1 : photos.length ? read / photos.length : heard, ready ? 1 : total && done.length === total ? 0.5 : 0],
    heard: [done.length, total] as const,
    read,
    photos,
    turns: done.flatMap((s) => (s.result as Done).turns).sort((a, b) => a.start - b.start),
  };
}
