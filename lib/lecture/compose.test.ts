// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./board";
import type { Box } from "./locate";
import { meta } from "./meta";
import { compose, toMarkdown, type Notes } from "./compose";

const board: Box = { x1: 0, y1: 70, x2: 1010, y2: 576, w: 1280, h: 720 };
const snap = (t: number, markdown: string): Snapshot => ({ t, url: `f${t}.jpg`, board, markdown, alt: "board" });
const notes = (snaps: number[]): Notes => ({
  title: "Energy",
  summary: "Mass and energy are the same thing.",
  sections: [{ heading: "Mass-energy", body: "Energy is $E = mc^2$.", snaps, exam: [{ quote: "This will be on the test.", t: 62 }] }],
  words: [{ term: "rest mass", meaning: "mass measured at rest" }],
});

beforeEach(() => {
  process.env.MODEL_API_KEY = "test-key";
  vi.restoreAllMocks();
});

describe("toMarkdown", () => {
  it("toMarkdown writes headings, board markdown and Exam lines", () => {
    const md = toMarkdown(notes([1]), [snap(0, "$a$"), snap(30, "$$E = mc^2$$")]);
    expect(md).toContain("# Energy");
    expect(md).toContain("## Mass-energy");
    expect(md).toContain("Energy is $E = mc^2$.");
    expect(md).toContain("$$E = mc^2$$");
    expect(md).not.toContain("$a$");
    expect(md).not.toContain("f30.jpg");
    expect(md).toContain("Exam: This will be on the test.");
    expect(md).toContain("rest mass");
  });
});

describe("toMarkdown repeats", () => {
  it("toMarkdown prints each snapshot once, at its first reference", () => {
    const n = notes([0]);
    n.sections.push({ heading: "Again", body: "More.", snaps: [0, 1], exam: [] });
    const md = toMarkdown(n, [snap(0, "BOARD-A"), snap(30, "BOARD-B")]);
    expect(md.split("BOARD-A")).toHaveLength(2);
    expect(md.indexOf("BOARD-A")).toBeLessThan(md.indexOf("## Again"));
    expect(md.indexOf("BOARD-B")).toBeGreaterThan(md.indexOf("## Again"));
  });
});

describe("compose", () => {
  it("compose tells the model to keep pipeline tags out of the prose and to state exam points cleanly", async () => {
    let prompt = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      prompt = body.input[0].content[0].text;
      return { output_text: JSON.stringify(notes([])) };
    }) as never);
    await compose({ turns: [], snaps: [], course: "ECO220", context: "" });
    expect(prompt).toContain("Never put timestamps, snap numbers, `pointing`");
    expect(prompt).toContain("short clean statement of what is examinable");
    expect(prompt).toContain('Only when a whole section has no speech, say "no speech captured"');
  });

  it("compose with zero turns still returns notes from snapshots", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      expect(body.model).toBe("muse-spark-1.3");
      expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
      const prompt = JSON.stringify(body.input);
      expect(prompt).toContain("$$E = mc^2$$");
      expect(prompt).toContain("no speech captured");
      expect(prompt).not.toContain("x".repeat(20_001));
      return { output_text: JSON.stringify(notes([0])) };
    }) as never);
    const out = await compose({ turns: [], snaps: [snap(30, "$$E = mc^2$$")], course: "PHY131", context: "x".repeat(30_000) });
    expect(create).toHaveBeenCalledOnce();
    expect(out).toEqual(notes([0]));
  });

  it("compose drops out-of-range snap indexes", async () => {
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify(notes([3, 0, 0.5, -1])) } as never);
    const out = await compose({ turns: [], snaps: [snap(30, "$x$")], course: "PHY131", context: "" });
    expect(out.sections[0].snaps).toEqual([0]);
  });
});
