import { describe, expect, it } from "vitest";
import type { Frame, Snapshot } from "./board";
import type { Box } from "./locate";
import { link, pointsAt } from "./link";

const board: Box = { x1: 100, y1: 0, x2: 1100, y2: 500, w: 1280, h: 720 };
// A person 100 px wide centred at x.
const at = (x: number): Box => ({ x1: x - 50, y1: 100, x2: x + 50, y2: 600, w: 1280, h: 720 });

describe("pointsAt", () => {
  it("pointsAt reads the board's thirds", () => {
    expect(pointsAt(at(200), board)).toBe("left"); // 10% of the width
    expect(pointsAt(at(600), board)).toBe("middle"); // 50%
    expect(pointsAt(at(1000), board)).toBe("right"); // 90%
  });

  it("pointsAt returns null more than 15% of the width outside the board", () => {
    expect(pointsAt(at(1500), board)).toBeNull(); // 40% past the right edge
    expect(pointsAt(at(1200), board)).toBe("right"); // 10% past: still at the board
    expect(pointsAt(at(-100), board)).toBeNull(); // 20% past the left edge
  });
});

describe("link", () => {
  const snap = (t: number): Snapshot => ({ t, url: `f${t}.jpg`, board, markdown: "", alt: "" });
  const frame = (t: number, person: Box | null): Frame => ({ t, url: `f${t}.jpg`, board, person, changed: false });
  const turn = (start: number) => ({ start, end: start + 3, text: `at ${start}` });

  it("link attaches the latest snapshot at or before the turn", () => {
    const snaps = [snap(10), snap(30)];
    const frames = [frame(0, at(200)), frame(10, at(600)), frame(30, null), frame(40, at(1000))];
    expect(link([turn(5), turn(10), turn(29), turn(38)], frames, snaps)).toEqual([
      { ...turn(5), snap: null, pointing: "left" }, // before the first snapshot; nearest frame is t=0 (tie with 10 goes to the earlier)
      { ...turn(10), snap: 0, pointing: "middle" },
      { ...turn(29), snap: 0, pointing: null }, // nearest frame (30) has no person
      { ...turn(38), snap: 1, pointing: "right" },
    ]);
  });

  it("link gives null pointing with no frames", () => {
    expect(link([turn(5)], [], [])).toEqual([{ ...turn(5), snap: null, pointing: null }]);
  });
});
