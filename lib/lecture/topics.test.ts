// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import type { Box } from "./locate";
import type { Snapshot } from "./board";
import type { Notes } from "./compose";
import { meta } from "./meta";
import { cleanUp, guardEdits, planTopics, tidy, writeTopic, type Plan } from "./topics";

vi.mock("./compose", async (orig) => ({ ...(await orig<typeof import("./compose")>()), compose: vi.fn() }));
const { compose } = await import("./compose");

type Topic = Plan["topics"][number];
const topic = (start: number, end: number, heading = `T${start}`): Topic => ({ heading, start, end, covers: `covers ${heading}` });
const section = (body: string, extra: Partial<Notes["sections"][number]> = {}): Notes["sections"][number] => ({ heading: "H", body, snaps: [], exam: [], ...extra });
const notesOf = (sections: Notes["sections"], words: Notes["words"] = []): Notes => ({ title: "T", summary: "S", sections, words });
const board: Box = { x1: 0, y1: 0, x2: 1000, y2: 500, w: 1280, h: 720 };
const snap = (t: number): Snapshot => ({ t, url: "", board, markdown: `board ${t}`, alt: "" });

beforeEach(() => {
  process.env.MODEL_API_KEY = "test-key";
  vi.restoreAllMocks();
  vi.mocked(compose).mockReset();
});
afterEach(() => vi.useRealTimers());
// A frozen clock at 0, so deadlines are plain milliseconds left.
const frozen = () => vi.useFakeTimers({ toFake: ["Date"], now: 0 });

describe("tidy math", () => {
  const body = (b: string) => tidy(notesOf([section(b)]), [], [topic(0, 100)]).sections[0].body;
  // The six cases from the prototype's wrap-test.mts.
  it.each([
    ["Subtract: \\left[\\begin{array}{cc|cc} 1 & 3 \\end{array} \\right].", "Subtract: $\\left[\\begin{array}{cc|cc} 1 & 3 \\end{array} \\right]$."],
    ["\\begin{bmatrix}2\\\\3\\end{bmatrix}\\begin{bmatrix}1&6\\end{bmatrix}=?", "$\\begin{bmatrix}2\\\\3\\end{bmatrix}\\begin{bmatrix}1&6\\end{bmatrix}$=?"],
    ["entry c_{34} is row 3 of $A$", "entry $c_{34}$ is row 3 of $A$"],
    ["already $c_{34}$ fine", "already $c_{34}$ fine"],
    ["plain text, no math", "plain text, no math"],
    ["$$x=1$$ stays", "$$x=1$$ stays"],
    // Review: merging touching inline math must not reach into display math.
    ["Here $a$ and $$b=1$$ then", "Here $a$ and $$b=1$$ then"],
  ])("tidy wraps loose LaTeX in body %#", (input, want) => expect(body(input)).toBe(want));

  // The two cases from env-test.mts.
  it("tidy closes each environment with the name it opened", () => {
    expect(body("$\\left[\\begin{array}{cc} 1 \\end{bmatrix}\\right]$")).toBe("$\\left[\\begin{array}{cc} 1 \\end{array}\\right]$");
    const nested = "$\\begin{bmatrix}\\begin{smallmatrix}1\\end{smallmatrix}\\end{bmatrix}$";
    expect(body(nested)).toBe(nested);
  });

  it("tidy unwraps formula tex and symbols, merges touching inline math, and makes display math in steps inline", () => {
    const n = notesOf([section("$a$$b$", {
      boxes: [
        { kind: "formula", tex: "$A_{m}$", symbols: [{ sym: "$m$", meaning: "row count" }] },
        { kind: "example", question: "q", steps: ["so $$x=1$$"], answer: "a" },
      ],
    })]);
    const out = tidy(n, [], [topic(0, 100)]).sections[0];
    expect(out.body).toBe("$a b$");
    expect(out.boxes![0]).toMatchObject({ tex: "A_{m}", symbols: [{ sym: "m" }] });
    expect(out.boxes![1]).toMatchObject({ steps: ["so $x=1$"] });
    expect(n.sections[0].body).toBe("$a$$b$"); // pure: the input is untouched
  });
});

describe("tidy filters", () => {
  it("tidy drops exam lines in a section whose topic never says exam, test, midterm, quiz or final", () => {
    const exam = [{ quote: "Know this", t: 10 }];
    const n = notesOf([section("one", { exam }), section("two", { exam })]);
    const turns = [{ start: 10, end: 20, text: "this is important" }, { start: 110, end: 120, text: "on the midterm" }];
    const out = tidy(n, turns, [topic(0, 100), topic(100, 200)]);
    expect(out.sections.map((s) => s.exam.length)).toEqual([0, 1]);
  });

  it("tidy keeps one entry per term and drops terms a section already names", () => {
    const words = [{ term: "pivot", meaning: "a" }, { term: "Pivot", meaning: "b" }, { term: "rank", meaning: "c" }];
    const out = tidy(notesOf([section("The rank counts pivots.", { heading: "Rank" })], words), [], [topic(0, 100)]);
    expect(out.words).toEqual([]);
    const out2 = tidy(notesOf([section("Row reduction.")], words), [], [topic(0, 100)]);
    expect(out2.words.map((w) => w.term.toLowerCase())).toEqual(["pivot", "rank"]);
  });
});

describe("guardEdits", () => {
  const ids = new Set(["s0", "s0.p0", "s0.p1", "s0.b0", "t0"]);
  const edit = (id: string, action: "delete" | "rewrite", keptIn = "", text = "") => ({ id, action, text, keptIn });

  it("guardEdits refuses edits to boxes and section headings", () => {
    expect(guardEdits([edit("s0.b0", "delete", "s0.p0"), edit("s0", "rewrite", "", "x")], ids)).toEqual([]);
  });

  it("guardEdits refuses a delete without an existing keptIn, or kept in itself", () => {
    expect(guardEdits([edit("s0.p1", "delete"), edit("s0.p1", "delete", "s9.p9"), edit("t0", "delete", "t0")], ids)).toEqual([]);
  });

  it("guardEdits refuses a delete kept in a section heading", () => {
    expect(guardEdits([edit("s0.p1", "delete", "s0")], ids)).toEqual([]);
  });

  it("guardEdits refuses a delete kept in a paragraph that is deleted too", () => {
    const out = guardEdits([edit("s0.p0", "delete", "s0.p1"), edit("s0.p1", "delete", "s0.b0")], ids);
    expect(out.map((e) => e.id)).toEqual(["s0.p1"]);
  });

  it("guardEdits refuses an empty rewrite and keeps a real one", () => {
    expect(guardEdits([edit("s0.p0", "rewrite", "", "  "), edit("t0", "rewrite", "", "new")], ids).map((e) => e.id)).toEqual(["t0"]);
  });
});

describe("writeTopic", () => {
  it("writeTopic sends only its topic's turns and snaps, and maps section snaps back to lecture indexes", async () => {
    vi.mocked(compose).mockResolvedValue({
      notes: notesOf([section("B", { snaps: [0, 1] })], [{ term: "x", meaning: "y" }]),
      usage: { "muse-spark-1.3": { in: 3, out: 4 } },
    });
    const snaps = [snap(10), snap(110), snap(150), snap(250)];
    const turns = [{ start: 20, end: 30, text: "a" }, { start: 120, end: 130, text: "b" }];
    const out = await writeTopic({ topic: topic(100, 200), others: [topic(0, 100, "Intro")], turns, frames: [], snaps, course: "MIT 18.06", keywords: [] });
    const sent = vi.mocked(compose).mock.calls[0][0];
    expect(sent.snaps.map((s) => s.t)).toEqual([110, 150]);
    expect(sent.turns.map((t) => [t.text, t.snap])).toEqual([["b", 0]]);
    expect(sent.part).toContain('Write exactly ONE section, for this topic only: "T100": covers T100.');
    expect(sent.part).toContain("- Intro: covers Intro");
    expect(out.sections[0].snaps).toEqual([1, 2]);
    expect(out.words).toEqual([{ term: "x", meaning: "y" }]);
    expect(out.usage).toEqual({ "muse-spark-1.3": { in: 3, out: 4 } });
  });

  it("writeTopic gives compose the time left before the deadline", async () => {
    frozen();
    vi.mocked(compose).mockResolvedValue({ notes: notesOf([section("B")]), usage: { "muse-spark-1.3": { in: 0, out: 0 } } });
    await writeTopic({ topic: topic(0, 100), others: [], turns: [], frames: [], snaps: [], course: "C", keywords: [], deadline: 40_000 });
    expect(vi.mocked(compose).mock.calls[0][0].timeout).toBe(35_000);
  });

  it("writeTopic retries once when the model times out", async () => {
    vi.mocked(compose)
      .mockRejectedValueOnce(new OpenAI.APIConnectionTimeoutError())
      .mockResolvedValueOnce({ notes: notesOf([section("B")]), usage: { "muse-spark-1.3": { in: 0, out: 0 } } });
    await writeTopic({ topic: topic(0, 100), others: [], turns: [], frames: [], snaps: [], course: "C", keywords: [] });
    expect(compose).toHaveBeenCalledTimes(2);
  });
});

describe("planTopics", () => {
  const plan: Plan = { title: "T", summary: "S", together: "G", topics: [topic(0, 100)] };

  it("planTopics asks with low reasoning and 60 s, and retries once on a 5xx", async () => {
    const create = vi.spyOn(meta().responses, "create")
      .mockRejectedValueOnce(new OpenAI.InternalServerError(500, undefined, "down", new Headers()))
      .mockResolvedValueOnce({ output_text: JSON.stringify(plan), usage: { input_tokens: 5, output_tokens: 6 } } as never);
    const out = await planTopics({ turns: [{ start: 0, end: 5, text: "hello" }], snaps: [], course: "MIT 18.06" });
    expect(out).toEqual({ plan, usage: { "muse-spark-1.3": { in: 5, out: 6 } } });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({ reasoning: { effort: "low" } });
    expect(create.mock.calls[0][1]).toEqual({ timeout: 60_000, maxRetries: 0 });
  });

  it("planTopics shortens its timeout to the deadline and skips the retry under 30 s left", async () => {
    frozen();
    const create = vi.spyOn(meta().responses, "create").mockRejectedValue(new OpenAI.InternalServerError(500, undefined, "down", new Headers()));
    await expect(planTopics({ turns: [], snaps: [], course: "C", deadline: 20_000 })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toEqual({ timeout: 15_000, maxRetries: 0 });
  });

  it("planTopics throws without a call when 5 s or less are left", async () => {
    frozen();
    const create = vi.spyOn(meta().responses, "create");
    await expect(planTopics({ turns: [], snaps: [], course: "C", deadline: 5_000 })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("planTopics does not retry a 4xx", async () => {
    const create = vi.spyOn(meta().responses, "create").mockRejectedValue(new OpenAI.BadRequestError(400, undefined, "bad", new Headers()));
    await expect(planTopics({ turns: [], snaps: [], course: "C" })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("cleanUp", () => {
  const draft = notesOf([section("Para one.\n\nPara two repeats one.", { boxes: [{ kind: "mistake", text: "m" }] })], [{ term: "pivot", meaning: "old" }]);

  it("cleanUp applies only guarded edits", async () => {
    const edits = [
      { id: "s0.p1", action: "delete", text: "", keptIn: "s0.p0" },
      { id: "t0", action: "rewrite", text: "Term: pivot: first nonzero in a row", keptIn: "" },
      { id: "s0.b0", action: "delete", text: "", keptIn: "s0.p0" },
    ];
    const create = vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify({ edits }), usage: { input_tokens: 1, output_tokens: 2 } } as never);
    const out = await cleanUp(draft);
    expect(out.notes.sections[0].body).toBe("Para one.");
    expect(out.notes.sections[0].boxes).toHaveLength(1);
    expect(out.notes.words).toEqual([{ term: "pivot", meaning: "first nonzero in a row" }]);
    expect(out.edits.map((e) => e.id)).toEqual(["s0.p1", "t0"]);
    expect(out.usage).toEqual({ "muse-spark-1.3": { in: 1, out: 2 } });
    expect(create.mock.calls[0][1]).toEqual({ timeout: 90_000, maxRetries: 0 });
  });

  it("cleanUp returns the draft without a call when under 25 s are left", async () => {
    frozen();
    const create = vi.spyOn(meta().responses, "create");
    expect(await cleanUp(draft, 24_000)).toEqual({ notes: draft, edits: [], usage: {} });
    expect(create).not.toHaveBeenCalled();
  });

  it("cleanUp keeps the draft when the call fails", async () => {
    vi.spyOn(meta().responses, "create").mockRejectedValue(new Error("down"));
    expect(await cleanUp(draft)).toEqual({ notes: draft, edits: [], usage: {} });
  });
});
