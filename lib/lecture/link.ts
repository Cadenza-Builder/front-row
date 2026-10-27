import type { Frame, Snapshot } from "./board";
import type { Box } from "./locate";
import type { Turn } from "./transcribe";

type Pointing = "left" | "middle" | "right" | null;
export type LinkedTurn = Turn & { snap: number | null; pointing: Pointing };

/** Which third of the board the person's centre is in; null when more than 15% of the board's width outside it. */
export function pointsAt(person: Box, board: Box): Pointing {
  const at = ((person.x1 + person.x2) / 2 - board.x1) / (board.x2 - board.x1);
  if (at < -0.15 || at > 1.15) return null;
  return at < 1 / 3 ? "left" : at < 2 / 3 ? "middle" : "right";
}

/** Frames and snapshots are in time order. `snap` indexes `snaps`. */
export function link(turns: Turn[], frames: Frame[], snaps: Snapshot[]): LinkedTurn[] {
  return turns.map((turn) => {
    const snap = snaps.findLastIndex((s) => s.t <= turn.start);
    let near: Frame | undefined;
    for (const f of frames) if (!near || Math.abs(f.t - turn.start) < Math.abs(near.t - turn.start)) near = f;
    const pointing = near?.person && near.board ? pointsAt(near.person, near.board) : null;
    return { ...turn, snap: snap === -1 ? null : snap, pointing };
  });
}
