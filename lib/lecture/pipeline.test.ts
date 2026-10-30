// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Box } from "./locate";
import type { Snapshot } from "./board";
import { finishLecture, framesToLocate, processSegment } from "./pipeline";

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
    vi.mocked(locate).mockResolvedValue({ board: null, person: null, kind: null });
    const out = await processSegment({ wav, offset: 0, frames: [frame(0), frame(10)], keywords: [] });
    expect(out.snaps).toEqual([]);
    expect(out.frames.map((f) => f.board)).toEqual([null, null]);
    expect(readBoard).not.toHaveBeenCalled();
    expect(out.turns).toHaveLength(1);
  });

  it("processSegment skips a snapshot whose board read fails, and a frame whose locate fails", async () => {
    vi.mocked(locate)
      .mockResolvedValueOnce({ board, person: null, kind: "blackboard" })
      .mockResolvedValueOnce({ board, person: null, kind: "blackboard" })
      .mockRejectedValueOnce(new Error("sam down"));
    vi.mocked(readBoard)
      .mockRejectedValueOnce(new Error("alt over 200"))
      .mockImplementationOnce(async (f) => ({ t: f.t, url: f.url, board: f.board, markdown: "$x$", alt: "x" }));
    // Frame 20 is unchanged, so frame 10's writing has settled and it is read.
    const out = await processSegment({ wav, offset: 0, frames: [frame(0), frame(10), { ...frame(20), changed: false }], keywords: [] });
    expect(out.snaps.map((s) => s.t)).toEqual([10]);
    // Board reads get the segment's transcript to settle unclear symbols.
    expect(vi.mocked(readBoard).mock.calls[0][1]).toEqual([{ start: 1, end: 2, text: "hi" }]);
    expect(out.frames[2].board).toBeNull();
  });

  it("processSegment starts locating before the transcript is back", async () => {
    vi.mocked(locate).mockResolvedValue({ board: null, person: null, kind: null });
    vi.mocked(transcribe).mockImplementation(() => vi.waitFor(() => { if (!vi.mocked(locate).mock.calls.length) throw new Error("not yet"); return [] }, { timeout: 200 }));
    await expect(processSegment({ wav, offset: 0, frames: [frame(0)], keywords: [] })).resolves.toMatchObject({ turns: [] });
  });

  it("processSegment fails when the transcript fails", async () => {
    vi.mocked(locate).mockResolvedValue({ board: null, person: null, kind: null });
    vi.mocked(transcribe).mockRejectedValue(new Error("whisper down"));
    await expect(processSegment({ wav, offset: 0, frames: [frame(0)], keywords: [] })).rejects.toThrow("whisper down");
  });

  it("processSegment refuses a frame url that is not https or data:", async () => {
    await expect(processSegment({ wav, offset: 0, frames: [{ t: 0, url: "file:///etc/passwd", changed: true }], keywords: [] })).rejects.toThrow();
    expect(locate).not.toHaveBeenCalled();
  });
});

describe("processSegment later segments", () => {
  it("processSegment after the first segment reads no board when nothing changed", async () => {
    vi.mocked(locate).mockResolvedValue({ board, person: null, kind: "blackboard" });
    const still = (t: number) => ({ ...frame(t), changed: false });
    const out = await processSegment({ wav, offset: 120, frames: [still(120), still(130)], keywords: [] });
    expect(out.snaps).toEqual([]);
    expect(readBoard).not.toHaveBeenCalled();
  });
});

describe("framesToLocate", () => {
  it("framesToLocate picks changed frames, the first frame, and one every 60 s", () => {
    const frames = Array.from({ length: 18 }, (_, i) => ({ t: i * 10, changed: i * 10 === 30 }));
    expect(framesToLocate(frames)).toEqual(new Set([0, 30, 90, 150]));
  });
});

describe("processSegment locates only some frames", () => {
  const frames = Array.from({ length: 18 }, (_, i) => ({ ...frame(i * 10), changed: i * 10 === 30 }));
  beforeEach(() => {
    vi.mocked(readBoard).mockImplementation(async (f) => ({ t: f.t, url: f.url, board: f.board, markdown: "", alt: "" }));
  });

  it("processSegment copies the last located boxes onto frames not located", async () => {
    vi.mocked(locate).mockImplementation(async (url) => ({ board: { ...board, x1: Number(url.split(",")[1]) }, person: null, kind: "blackboard" }));
    const out = await processSegment({ wav, offset: 120, frames, keywords: [] });
    expect(vi.mocked(locate).mock.calls.map(([url]) => url)).toEqual([0, 30, 90, 150].map((t) => frame(t).url));
    const at = (t: number) => out.frames.find((f) => f.t === t)!;
    expect(at(40).board).toEqual(at(30).board);
    expect(at(40).person).toEqual(at(30).person);
    expect(at(40).board!.x1).toBe(30);
    expect(at(170).board!.x1).toBe(150);
    expect(at(40)).not.toHaveProperty("kind"); // frames are saved; the kind is only for locating
  });

  it("processSegment locates the first frame with all kinds, the rest with its kind", async () => {
    vi.mocked(locate).mockResolvedValue({ board, person: null, kind: "blackboard" });
    await processSegment({ wav, offset: 120, frames, keywords: [] });
    const calls = vi.mocked(locate).mock.calls;
    expect(calls[0]).toEqual([frame(0).url, undefined]);
    expect(calls.slice(1)).toEqual([30, 90, 150].map((t) => [frame(t).url, "blackboard"]));
  });

  it("processSegment with no board anywhere still locates the first frame with all kinds", async () => {
    vi.mocked(locate).mockResolvedValue({ board: null, person: null, kind: null });
    const out = await processSegment({ wav, offset: 120, frames, keywords: [] });
    expect(vi.mocked(locate).mock.calls.map((c) => c[1])).toEqual([undefined, undefined, undefined, undefined]);
    expect(out.frames.every((f) => f.board === null)).toBe(true);
  });
});

describe("finishLecture", () => {
  const A = "Kirchhoff's voltage law: $\\sum V = 0$ around any closed loop, so $V_R + V_L + V_C = V$";
  const B = "$$\\hat\\beta = (X^TX)^{-1}X^Ty,\\; \\operatorname{Var}(\\hat\\beta) = \\sigma^2(X^TX)^{-1}$$";
  // Distinct text per time by default, so dedupeSnaps keeps them all.
  const snap = (t: number, markdown = t === 10 ? A : `${B} board ${t}`): Snapshot => ({ t, url: "", board, markdown, alt: "" });
  const notes = { title: "T", summary: "S", sections: [], words: [] };

  beforeEach(() => vi.mocked(compose).mockReset().mockResolvedValue({ notes, usage: { "muse-spark-1.3": { in: 0, out: 0 } } }));

  it("finishLecture joins turns across segments", async () => {
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
    expect(out.markdown).not.toContain("board 130");
    expect(out.usage).toEqual({ "muse-spark-1.3": { in: 1, out: 2 } });
  });

  it("finishLecture composes and returns deduped snaps", async () => {
    const segments = [
      { turns: [{ start: 0, end: 60, text: "a" }], frames: [], snaps: [snap(10, A)] },
      { turns: [{ start: 125, end: 150, text: "c" }], frames: [], snaps: [snap(130, A)] },
    ];
    const out = await finishLecture(segments, "PHY131", []);
    expect(vi.mocked(compose).mock.calls[0][0].snaps).toHaveLength(1);
    expect(out.snaps.map((s) => s.t)).toEqual([10]);
  });

  it("finishLecture links speech between a replaced photo and its replacement to the previous kept photo", async () => {
    const fuller = A + "\n$$L\\frac{d^2Q}{dt^2}+R\\frac{dQ}{dt}+\\frac1C Q=V$$";
    const segments = [{ turns: [{ start: 15, end: 20, text: "this one" }], frames: [], snaps: [snap(5, B), snap(10, A), snap(30, fuller)] }];
    await finishLecture(segments, "PHY131", []);
    const sent = vi.mocked(compose).mock.calls[0][0];
    expect(sent.snaps.map((s) => s.t)).toEqual([5, 30]);
    // Known limit (spec D): A@10 was replaced by A+@30, so speech at 15 links back to B.
    expect(sent.turns[0].snap).toBe(0);
  });
});
