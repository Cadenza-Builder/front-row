import { describe, expect, it } from "vitest";
import { progress, type SegRow } from "./progress";

const board = { x1: 0, y1: 0, x2: 10, y2: 10, w: 100, h: 100 };
const done = (n: number, t: number, text: string): SegRow => ({
  n,
  status: "done",
  result: { turns: [{ start: t, end: t + 5, text }], frames: [], snaps: [{ t, url: `${n}-${t}.jpg`, board, markdown: "$y$", alt: "" }] },
});
const uploaded = (n: number, frames: { t: number; changed: boolean }[]): SegRow => ({ n, status: "uploaded", result: { frames } });

describe("progress", () => {
  it("starts empty while the last part saves", () => {
    const p = progress({ status: "recording", segment_count: 0 }, []);
    expect(p.steps).toEqual([0.5, 0, 0, 0]);
    expect(p.photos).toEqual([]);
  });

  it("counts heard parts, read photos and the transcript in time order", () => {
    const p = progress({ status: "processing", segment_count: 3 }, [done(1, 130, "second"), uploaded(2, [{ t: 250, changed: true }, { t: 260, changed: false }]), done(0, 10, "first")]);
    expect(p.heard).toEqual([2, 3]);
    expect(p.photos.map((x) => [x.name, !!x.snap])).toEqual([["0-10.jpg", true], ["1-130.jpg", true], ["2-250.jpg", false]]);
    expect(p.read).toBe(2);
    expect(p.turns.map((t) => t.text)).toEqual(["first", "second"]);
    expect(p.steps).toEqual([1, 2 / 3, 2 / 3, 0]);
  });

  it("a failed segment is not heard; writing starts half way once every part is in", () => {
    expect(progress({ status: "processing", segment_count: 2 }, [done(0, 0, "a"), { n: 1, status: "failed", result: { frames: [] } }]).steps[3]).toBe(0);
    expect(progress({ status: "processing", segment_count: 2 }, [done(0, 0, "a"), done(1, 120, "b")]).steps).toEqual([1, 1, 1, 0.5]);
  });

  it("ready fills every bar", () => {
    expect(progress({ status: "ready", segment_count: 1 }, []).steps).toEqual([1, 1, 1, 1]);
  });
});
