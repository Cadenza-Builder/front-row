// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Box } from "./locate";
import type { Snapshot } from "./board";
import { finishLecture, processSegment } from "./pipeline";

vi.mock("./transcribe", async (orig) => ({ ...(await orig<typeof import("./transcribe")>()), transcribe: vi.fn() }));
vi.mock("./locate", () => ({ locate: vi.fn() }));
vi.mock("./board", async (orig) => ({ ...(await orig<typeof import("./board")>()), readBoard: vi.fn() }));
vi.mock("./compose", async (orig) => ({ ...(await orig<typeof import("./compose")>()), compose: vi.fn() }));
const { transcribe } = await import("./transcribe");
const { locate } = await import("./locate");
const { readBoard } = await import("./board");
const { compose } = await import("./compose");

const board: Box = { x1: 0, y1: 0, x2: 1000, y2: 500, w: 1280, h: 720 };
const wav = new Blob([]);
const frame = (t: number) => ({ t, url: `data:image/jpeg;base64,${t}`, changed: true });

beforeEach(() => {
  vi.mocked(transcribe).mockReset().mockResolvedValue([{ start: 1, end: 2, text: "hi" }]);
  vi.mocked(locate).mockReset();
  vi.mocked(readBoard).mockReset();
});

describe("processSegment", () => {
  it("processSegment with no board anywhere returns snaps []", async () => {
    vi.mocked(locate).mockResolvedValue({ board: null, person: null });
    const out = await processSegment({ wav, offset: 0, frames: [frame(0), frame(10)], keywords: [] });
    expect(out.snaps).toEqual([]);
    expect(out.frames.map((f) => f.board)).toEqual([null, null]);
    expect(readBoard).not.toHaveBeenCalled();
    expect(out.turns).toHaveLength(1);
  });

  it("processSegment skips a snapshot whose board read fails, and a frame whose locate fails", async () => {
    vi.mocked(locate)
      .mockResolvedValueOnce({ board, person: null })
      .mockResolvedValueOnce({ board, person: null })
      .mockRejectedValueOnce(new Error("sam down"));
    vi.mocked(readBoard)
      .mockRejectedValueOnce(new Error("alt over 200"))
      .mockImplementationOnce(async (f) => ({ t: f.t, url: f.url, board: f.board, markdown: "$x$", alt: "x" }));
    const out = await processSegment({ wav, offset: 0, frames: [frame(0), frame(10), frame(20)], keywords: [] });
    expect(out.snaps.map((s) => s.t)).toEqual([10]);
    // Board reads get the segment's transcript to settle unclear symbols.
    expect(vi.mocked(readBoard).mock.calls[0][1]).toEqual([{ start: 1, end: 2, text: "hi" }]);
    expect(out.frames[2].board).toBeNull();
  });

  it("processSegment refuses a frame url that is not https or data:", async () => {
    await expect(processSegment({ wav, offset: 0, frames: [{ t: 0, url: "file:///etc/passwd", changed: true }], keywords: [] })).rejects.toThrow();
    expect(locate).not.toHaveBeenCalled();
  });
});

describe("processSegment later segments", () => {
  it("processSegment after the first segment reads no board when nothing changed", async () => {
    vi.mocked(locate).mockResolvedValue({ board, person: null });
    const still = (t: number) => ({ ...frame(t), changed: false });
    const out = await processSegment({ wav, offset: 120, frames: [still(120), still(130)], keywords: [] });
    expect(out.snaps).toEqual([]);
    expect(readBoard).not.toHaveBeenCalled();
  });
});

describe("finishLecture", () => {
  it("finishLecture joins turns across segments", async () => {
    const snap = (t: number): Snapshot => ({ t, url: "", board, markdown: `board ${t}`, alt: "" });
    vi.mocked(compose).mockResolvedValue({ notes: { title: "T", summary: "S", sections: [{ heading: "H", body: "B", snaps: [0, 1], exam: [] }], words: [] }, usage: { "muse-spark-1.3": { in: 1, out: 2 } } });
    const segments = [
      { turns: [{ start: 0, end: 60, text: "a" }, { start: 60, end: 121, text: "b" }], frames: [], snaps: [snap(10)] },
      // Overlap: "b" again (ends before 121) is dropped.
      { turns: [{ start: 119, end: 120.5, text: "b" }, { start: 131, end: 150, text: "c" }], frames: [], snaps: [snap(130)] },
    ];
    const out = await finishLecture(segments, "ECO220", ["OLS"]);
    const sent = vi.mocked(compose).mock.calls[0][0];
    expect(sent.keywords).toEqual(["OLS"]);
    expect(sent.turns.map((t) => [t.text, t.snap])).toEqual([["a", null], ["b", 0], ["c", 1]]);
    expect(out.snaps.map((s) => s.t)).toEqual([10, 130]);
    expect(out.markdown).toContain("board 130");
    expect(out.usage).toEqual({ "muse-spark-1.3": { in: 1, out: 2 } });
  });
});
