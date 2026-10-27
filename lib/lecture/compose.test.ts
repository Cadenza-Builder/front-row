// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./board";
import type { Box } from "./locate";
import { meta } from "./meta";
import { checkSnaps, compose, toMarkdown, type Notes } from "./compose";

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
});

describe("checkSnaps", () => {
  it("checkSnaps throws on an index out of range", () => {
    expect(() => checkSnaps(notes([5]), 2)).toThrow();
    expect(() => checkSnaps(notes([0.5]), 2)).toThrow();
    expect(checkSnaps(notes([1]), 2)).toEqual(notes([1]));
  });
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

describe("compose", () => {
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

  it("compose rejects notes that point at a snapshot that does not exist", async () => {
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify(notes([3])) } as never);
    await expect(compose({ turns: [], snaps: [snap(30, "$x$")], course: "PHY131", context: "" })).rejects.toThrow();
  });
});
